// ============================================================================
// Recommendation engine — Phase 3.1 (deterministic core).
//
// Surfaces ranked, actionable recommendations for the merchant's INTERVENE
// approval queue. The dashboard's "control room" pitch is:
//
//   "AVA noticed this friction → recommends this action → merchant approves →
//    experiment runs → revenue impact appears."
//
// THIS module is the first step in that loop. It reads:
//   - InterventionRepo.countOutcomesByFriction (real outcomes per F-code)
//   - sales-playbooks registry (curated copy + actionCode per F-code)
//
// And produces an array of CreateRecommendationInput objects ranked by
// expected impact × confidence. No LLM. No copy-writing. Codex Phase 3
// guardrail: get the rows correct before adding LLM rationale.
//
// Rules implemented:
//
//   Rule A — Underperforming friction with a playbook available
//     Conditions:
//       - frictionId fires ≥ MIN_SAMPLE times in the window
//       - conversion rate < POOR_CONVERSION_THRESHOLD
//       - sales-playbooks has a curated playbook for this F-code
//       - no pending/approved Recommendation already exists for this F-code
//     Action: recommend swapping in the playbook's actionCode + payloadTemplate.
//     Expected lift: relative +50% (the playbook is hand-tuned for this F-code).
//
//   Rule B — High-dismissal friction without a playbook
//     Conditions:
//       - frictionId fires ≥ MIN_SAMPLE times
//       - dismissalRate > HIGH_DISMISSAL_THRESHOLD
//       - no playbook → can't auto-suggest curated copy
//       - no pending Recommendation already
//     Action: recommend SOFTENING the tier (active → nudge, nudge → passive).
//     Expected lift: relative +20% (less data; conservative).
//
// More rules will land alongside outcome telemetry in later sub-phases.
// ============================================================================

import {
  InterventionRepo,
  RecommendationRepo,
  MoveOutcomeRepo,
} from "@ava/db";
import { getPlaybook } from "../voice/sales-playbooks.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "recommendation-engine" });

// ---------------------------------------------------------------------------
// Thresholds — env-overridable for tuning without a deploy.
// ---------------------------------------------------------------------------

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const MIN_SAMPLE = () => numEnv("REC_MIN_SAMPLE", 25);
const POOR_CONVERSION_THRESHOLD = () => numEnv("REC_POOR_CONV_RATE", 0.05);
const HIGH_DISMISSAL_THRESHOLD = () => numEnv("REC_HIGH_DISMISS_RATE", 0.5);
const DEFAULT_WINDOW_DAYS = () => numEnv("REC_WINDOW_DAYS", 14);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RecommendationCandidate {
  siteUrl: string;
  frictionId: string;
  interventionType: string;
  actionCode: string;
  payloadTemplate: string;
  rationale: string;
  expectedLiftPct: number;
  confidence: number;
  sampleSizeBasis: number;
  /** Internal ranking score = expectedLiftPct × confidence. Higher is better. */
  rankScore: number;
}

export interface GenerateOptions {
  siteUrl: string;
  /** Override the analysis window (default REC_WINDOW_DAYS env / 14). */
  windowDays?: number;
  /** Inject `now` for deterministic tests. */
  now?: Date;
  /** Cap on candidates returned. Default 25. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Confidence scoring — sample-size driven.
// ---------------------------------------------------------------------------

export function confidenceFromSample(sampleSize: number): number {
  if (sampleSize < 25) return 0.1;
  if (sampleSize < 50) return 0.3;
  if (sampleSize < 100) return 0.5;
  if (sampleSize < 200) return 0.7;
  if (sampleSize < 500) return 0.85;
  return 0.95;
}

// ---------------------------------------------------------------------------
// Tier softening map for Rule B.
// ---------------------------------------------------------------------------

function softerTier(current: string | null | undefined): string | null {
  switch (current) {
    case "escalate": return "active";
    case "active":   return "nudge";
    case "nudge":    return "passive";
    default:         return null;
  }
}

// ---------------------------------------------------------------------------
// MoveOutcome → rank multiplier (Thinking Layer P1/P2.3 — Codex 2026-05-19).
// ---------------------------------------------------------------------------

/** Best-effort load of per-tactic accuracy. Returns empty map on failure. */
async function loadTacticAccuracy(
  since: Date,
): Promise<Map<string, number>> {
  try {
    const rows = await MoveOutcomeRepo.aggregateByTactic({ since });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (typeof r.avgAccuracy === "number") map.set(r.tacticId, r.avgAccuracy);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Multiplier in [0.5, 1.0] applied to rankScore.
 *
 *   - No data for this tactic → 1.0 (neutral, don't punish new tactics).
 *   - Perfect accuracy (1.0)  → 1.0.
 *   - Zero accuracy (0.0)     → 0.5 (damped, not killed — sample may be small).
 *
 * Formula: 0.5 + 0.5 × accuracy. Easy to reason about; easy to tune.
 */
export function computeAccuracyMultiplier(
  tacticAccuracy: Map<string, number>,
  tacticId: string,
): number {
  const acc = tacticAccuracy.get(tacticId);
  if (acc == null) return 1.0;
  const clamped = Math.max(0, Math.min(1, acc));
  return 0.5 + 0.5 * clamped;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Generate ranked recommendation candidates for a site over the analysis
 * window. Does NOT persist — caller decides what to write (usually all of
 * them, but the API layer may de-dupe further).
 */
export async function generateRecommendations(
  opts: GenerateOptions,
): Promise<RecommendationCandidate[]> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS();
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // 1. Load real outcomes per frictionId.
  const perFriction = await InterventionRepo.countOutcomesByFriction(opts.siteUrl, since);

  // Thinking Layer P1/P2.3 fix (Codex 2026-05-19) — pull MoveOutcome
  // aggregates per tactic so the predict→measure→learn loop actually
  // weights ranking. Maps tacticId (e.g. "F042_step0") to avgAccuracy.
  // Defensive: any failure → empty map (no weighting applied).
  const tacticAccuracy = await loadTacticAccuracy(since);

  // 2. De-dupe against pending/approved/active recommendations so we don't
  //    spam the merchant with the same suggestion twice.
  const inflight = await RecommendationRepo.listBySite(opts.siteUrl, {
    status: undefined, // all statuses — we'll filter below
    limit: 500,
  });
  const inflightByFriction = new Set<string>();
  for (const r of inflight) {
    if (r.status === "pending" || r.status === "approved" || r.status === "active") {
      inflightByFriction.add(r.frictionId);
    }
  }

  const candidates: RecommendationCandidate[] = [];

  for (const row of perFriction) {
    if (row.total < MIN_SAMPLE()) continue;
    if (inflightByFriction.has(row.frictionId)) continue;

    const conversionRate = row.total === 0 ? 0 : row.converted / row.total;
    const dismissalRate = row.total === 0 ? 0 : row.dismissed / row.total;

    // ── Rule A — playbook swap for underperforming friction ───────────────
    const playbook = getPlaybook(row.frictionId);
    if (playbook && conversionRate < POOR_CONVERSION_THRESHOLD()) {
      // Use the playbook's first step as the proposed action.
      const step = playbook.steps[0];
      const expectedLiftPct = 50; // hand-tuned playbook → +50% relative.
      const confidence = confidenceFromSample(row.total);
      // Accuracy-weighted rank — tactics that historically predict the
      // visitor's next state well rank higher; tactics that miss get
      // damped. Step-0 tactic id matches the playbook opener.
      const accuracyMultiplier = computeAccuracyMultiplier(
        tacticAccuracy,
        `${row.frictionId}_step0`,
      );
      candidates.push({
        siteUrl: opts.siteUrl,
        frictionId: row.frictionId,
        interventionType: "active",
        actionCode: `PLAYBOOK_${row.frictionId}`,
        payloadTemplate: JSON.stringify({
          voice_script: step.voice_script,
          sales_dialog: step.sales_dialog,
          playbook_objective: step.objective,
        }),
        rationale:
          `${row.frictionId} fired ${row.total} times in the last ${windowDays} days ` +
          `with a ${(conversionRate * 100).toFixed(1)}% conversion rate. ` +
          `Swapping to the curated "${playbook.name}" playbook is expected to lift ` +
          `conversions on this friction.`,
        expectedLiftPct,
        confidence,
        sampleSizeBasis: row.total,
        rankScore: expectedLiftPct * confidence * accuracyMultiplier,
      });
      continue;
    }

    // ── Rule B — soften tier for high-dismissal friction (no playbook) ────
    if (!playbook && dismissalRate > HIGH_DISMISSAL_THRESHOLD()) {
      // We need the current tier from any active intervention for this
      // friction. Without per-friction state we infer it from outcomes —
      // a dismissed-heavy friction probably fired as `active`. Softening
      // moves it to `nudge`.
      const proposedTier = softerTier("active") ?? "nudge";
      const expectedLiftPct = 20; // conservative — fewer signals than Rule A.
      const confidence = confidenceFromSample(row.total) * 0.7; // discount for the heuristic
      // No playbook → no tactic-level accuracy signal available; rule B
      // uses the unmultiplied score.
      candidates.push({
        siteUrl: opts.siteUrl,
        frictionId: row.frictionId,
        interventionType: proposedTier,
        actionCode: `SOFTEN_${row.frictionId}`,
        payloadTemplate: JSON.stringify({
          tier: proposedTier,
          reason: "high_dismissal_rate",
        }),
        rationale:
          `${row.frictionId} fired ${row.total} times in the last ${windowDays} days ` +
          `with a ${(dismissalRate * 100).toFixed(1)}% dismissal rate. ` +
          `Shoppers are pushing back — softening the intervention tier may improve receptivity.`,
        expectedLiftPct,
        confidence,
        sampleSizeBasis: row.total,
        rankScore: expectedLiftPct * confidence,
      });
      continue;
    }
  }

  // 3. Rank by expected impact × confidence, cap at `limit`.
  candidates.sort((a, b) => b.rankScore - a.rankScore);
  const limit = opts.limit ?? 25;
  const capped = candidates.slice(0, limit);

  log.info(
    {
      siteUrl: opts.siteUrl,
      windowDays,
      analysed: perFriction.length,
      inflight: inflightByFriction.size,
      produced: capped.length,
    },
    "[Recommendation engine] generation complete",
  );

  return capped;
}

/**
 * Convenience: generate + persist in one shot. Returns the persisted rows
 * (with their newly-minted IDs). Used by the nightly job and the on-demand
 * "regenerate" API.
 */
export async function generateAndPersist(opts: GenerateOptions) {
  const candidates = await generateRecommendations(opts);
  const persisted = await Promise.all(
    candidates.map((c) =>
      RecommendationRepo.createRecommendation({
        siteUrl: c.siteUrl,
        frictionId: c.frictionId,
        interventionType: c.interventionType,
        actionCode: c.actionCode,
        payloadTemplate: c.payloadTemplate,
        rationale: c.rationale,
        expectedLiftPct: c.expectedLiftPct,
        confidence: c.confidence,
        sampleSizeBasis: c.sampleSizeBasis,
      }),
    ),
  );
  return persisted;
}
