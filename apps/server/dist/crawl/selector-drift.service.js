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
import { logger } from "../logger.js";
const log = logger.child({ service: "selector-drift" });
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
export function compareFingerprints(baseline, current) {
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
    const missingKeys = [];
    const changedKeys = [];
    const addedKeys = [];
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
        }
        else {
            changedKeys.push(k);
        }
    }
    for (const k of curKeys) {
        if (!baseKeys.has(k))
            addedKeys.push(k);
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
function parseSelectors(json) {
    if (!json)
        return {};
    try {
        const v = JSON.parse(json);
        if (!v || typeof v !== "object")
            return {};
        const out = {};
        for (const [k, val] of Object.entries(v)) {
            if (typeof val === "string")
                out[k] = val;
        }
        return out;
    }
    catch {
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
export async function checkDriftForSite(siteUrl, opts = {}) {
    const warnThreshold = opts.warnThreshold ?? 0.7;
    const criticalThreshold = opts.criticalThreshold ?? 0.4;
    const dedupHours = opts.dedupWindowHours ?? 6;
    const rows = await SiteSelectorFingerprintRepo.listForSite(siteUrl);
    const results = [];
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
        const baseline = {
            hash: row.baselineHash,
            selectors: parseSelectors(row.baselineSelectors),
        };
        const current = {
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
            const recent = await DriftAlertRepo.hasRecentAlert("selector_drift", row.pageType, // use pageType in the windowType slot for dedup
            siteUrl, dedupHours);
            if (recent) {
                alertSuppressed = true;
            }
            else {
                await DriftAlertRepo.createAlert({
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
    log.info({
        siteUrl,
        checkedPageTypes: rows.length,
        withBaseline: scoredCount,
        overallSimilarity,
        alertsEmitted: results.filter((r) => r.alertEmitted).length,
    }, "[Selector drift] check complete");
    return { siteUrl, results, overallSimilarity };
}
//# sourceMappingURL=selector-drift.service.js.map