// ============================================================================
// Selector-drift service — Phase 1.5.5.
//
// Compares the current SiteSelectorFingerprint row against its stored
// baseline and emits DriftAlert rows when similarity drops below threshold.
//
// SPLIT LIFECYCLE (per Codex review):
//   1. Baseline capture — happens explicitly via
//      `SiteSelectorFingerprintRepo.markAsBaseline()` after a successful
//      ingest. THIS service does not auto-promote — comparison is meaningless
//      without a trusted baseline, and a stale auto-baseline would suppress
//      real drift.
//   2. Comparison — `checkDriftForSite(siteUrl)` runs the Jaccard / value
//      overlap math and emits alerts with 6h dedup.
//
// All logic here is pure or repo-backed. No HTTP, no LLM, no DOM access.
// ============================================================================

import { SiteSelectorFingerprintRepo, DriftAlertRepo } from "@ava/db";
import { createDriftAlertWithNotify } from "../drift/drift-create.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "selector-drift" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FingerprintBaseline {
  hash: string;
  selectors: Record<string, string>;
}

export interface FingerprintCurrent {
  hash: string;
  selectors: Record<string, string>;
}

export interface SimilarityResult {
  /** 0..1 — 1 = identical, 0 = totally diverged. */
  score: number;
  /** Keys present in baseline but missing from current. */
  missingKeys: string[];
  /** Keys present in both but with different selector strings. */
  changedKeys: string[];
  /** Keys only in current (the site grew). */
  addedKeys: string[];
  /** Quick yes/no — true iff the SHA fingerprints already match. */
  identicalHash: boolean;
}

export interface PageTypeDriftResult {
  pageType: string;
  /** null when no baseline exists for this (siteUrl, pageType). */
  similarity: SimilarityResult | null;
  /** Was an alert emitted this run? */
  alertEmitted: boolean;
  /** Was an alert SKIPPED because a recent one already exists? */
  alertSuppressed: boolean;
}

export interface SiteDriftResult {
  siteUrl: string;
  results: PageTypeDriftResult[];
  /** Average similarity across page types that had a baseline. */
  overallSimilarity: number | null;
}

export interface DriftCheckOptions {
  /** Below this overall similarity, emit alerts. Default 0.7. */
  warnThreshold?: number;
  /** Below THIS, alert is `critical` instead of `warning`. Default 0.4. */
  criticalThreshold?: number;
  /** Suppress duplicate alerts within this many hours. Default 6 (per CLAUDE.md). */
  dedupWindowHours?: number;
}

// ---------------------------------------------------------------------------
// Pure comparison
// ---------------------------------------------------------------------------

/**
 * Compute selector-set similarity between baseline and current. Strategy:
 *
 *   - If hashes match exactly → score=1, no further work.
 *   - Otherwise compute symmetric difference over the selector key sets,
 *     then for shared keys check whether the selector strings agree.
 *
 * Score is calibrated so a typical theme reskin (~half the selectors change
 * but the schema is preserved) lands in the 0.4–0.7 band, prompting a
 * `warning` rather than `critical`.
 */
export function compareFingerprints(
  baseline: FingerprintBaseline,
  current: FingerprintCurrent,
): SimilarityResult {
  if (baseline.hash === current.hash) {
    return {
      score: 1,
      missingKeys: [],
      changedKeys: [],
      addedKeys: [],
      identicalHash: true,
    };
  }
  const baseKeys = new Set(Object.keys(baseline.selectors));
  const curKeys = new Set(Object.keys(current.selectors));

  const missingKeys: string[] = [];
  const changedKeys: string[] = [];
  const addedKeys: string[] = [];
  let shared = 0;
  let agreed = 0;

  for (const k of baseKeys) {
    if (!curKeys.has(k)) {
      missingKeys.push(k);
      continue;
    }
    shared++;
    if (current.selectors[k] === baseline.selectors[k]) {
      agreed++;
    } else {
      changedKeys.push(k);
    }
  }
  for (const k of curKeys) {
    if (!baseKeys.has(k)) addedKeys.push(k);
  }

  // Jaccard-like score: agreed selectors / union-of-keys. Penalizes both
  // missing baseline keys (real loss of coverage) and added keys (new but
  // unfamiliar surfaces) equally with mismatched values.
  const union = baseKeys.size + addedKeys.length;
  const score = union === 0 ? 0 : agreed / union;

  return { score, missingKeys, changedKeys, addedKeys, identicalHash: false };
}

// ---------------------------------------------------------------------------
// Comparison runner
// ---------------------------------------------------------------------------

function parseSelectors(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Run a drift check for every (siteUrl, pageType) row that has a baseline.
 * Emits a DriftAlert per pageType whose similarity falls below the warn
 * threshold, deduplicated by the existing 6h hasRecentAlert primitive.
 *
 * Rows WITHOUT a baseline are silently skipped — the lifecycle guarantee
 * is "no comparison until baseline." That's why baseline capture lives in
 * the repo's `markAsBaseline`, separate from this service.
 */
export async function checkDriftForSite(
  siteUrl: string,
  opts: DriftCheckOptions = {},
): Promise<SiteDriftResult> {
  const warnThreshold = opts.warnThreshold ?? 0.7;
  const criticalThreshold = opts.criticalThreshold ?? 0.4;
  const dedupHours = opts.dedupWindowHours ?? 6;

  const rows = await SiteSelectorFingerprintRepo.listForSite(siteUrl);
  const results: PageTypeDriftResult[] = [];
  let totalScore = 0;
  let scoredCount = 0;

  for (const row of rows) {
    if (!row.baselineHash || !row.baselineSelectors) {
      results.push({
        pageType: row.pageType,
        similarity: null,
        alertEmitted: false,
        alertSuppressed: false,
      });
      continue;
    }

    const baseline: FingerprintBaseline = {
      hash: row.baselineHash,
      selectors: parseSelectors(row.baselineSelectors),
    };
    const current: FingerprintCurrent = {
      hash: row.fingerprintHash,
      selectors: parseSelectors(row.selectors),
    };

    const sim = compareFingerprints(baseline, current);
    totalScore += sim.score;
    scoredCount++;

    let alertEmitted = false;
    let alertSuppressed = false;

    if (sim.score < warnThreshold) {
      const severity = sim.score < criticalThreshold ? "critical" : "warning";
      const recent = await DriftAlertRepo.hasRecentAlert(
        "selector_drift",
        row.pageType,        // use pageType in the windowType slot for dedup
        siteUrl,
        dedupHours,
      );
      if (recent) {
        alertSuppressed = true;
      } else {
        // Phase 4.2 — persist + notify (email + critical-only PagerDuty).
        await createDriftAlertWithNotify({
          siteUrl,
          alertType: "selector_drift",
          severity,
          windowType: row.pageType,
          metric: "selectorSimilarity",
          expected: 1.0,
          actual: sim.score,
          message: `Selector drift on ${row.pageType}: similarity ${(sim.score * 100).toFixed(0)}% ` +
                   `(${sim.missingKeys.length} missing, ${sim.changedKeys.length} changed, ${sim.addedKeys.length} added)`,
        });
        // Also bump the per-fingerprint drift counter for the dashboard health card.
        await SiteSelectorFingerprintRepo.recordDrift(siteUrl, row.pageType);
        alertEmitted = true;
      }
    }

    results.push({
      pageType: row.pageType,
      similarity: sim,
      alertEmitted,
      alertSuppressed,
    });
  }

  const overallSimilarity = scoredCount === 0 ? null : totalScore / scoredCount;
  log.info(
    {
      siteUrl,
      checkedPageTypes: rows.length,
      withBaseline: scoredCount,
      overallSimilarity,
      alertsEmitted: results.filter((r) => r.alertEmitted).length,
    },
    "[Selector drift] check complete",
  );

  return { siteUrl, results, overallSimilarity };
}
