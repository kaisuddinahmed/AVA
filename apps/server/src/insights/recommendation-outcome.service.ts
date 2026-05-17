// ============================================================================
// Recommendation-outcome service — Phase 3.4.
//
// Turns a running Recommendation → Experiment into a measurable result:
//   - per-variant outcomes (sessions, conversions, revenue) from real
//     intervention data
//   - statistical significance via the existing 2-proportion z-test
//   - attributed revenue = treatment_revenue - control_revenue (>=0)
//   - decision pill: ship | rollback | inconclusive | extend
//
// One call → one persisted RecommendationOutcome snapshot. The dashboard
// reads the latest snapshot per Recommendation; the weekly digest reads
// all snapshots in the window.
//
// Decision rules (codified — easy to revisit when telemetry matures):
//   - any variant has 0 sessions OR total sessions < MIN_OUTCOME_SAMPLE
//       → "inconclusive"
//   - significance test passes (p < 1 - confidenceLevel):
//       uplift > 0  → "ship"
//       uplift < 0  → "rollback"
//   - not yet significant:
//       uplift > 0  → "extend"  (keep running, trending positive)
//       uplift <= 0 → "inconclusive"
// ============================================================================

import {
  RecommendationRepo,
  RecommendationOutcomeRepo,
  ExperimentRepo,
} from "@ava/db";
import { testSignificance } from "../experiment/experiment-metrics.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "recommendation-outcome.service" });

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Minimum total sessions (control + treatment) before we'll emit a decision. */
const MIN_OUTCOME_SAMPLE = () => numEnv("REC_OUTCOME_MIN_SAMPLE", 50);
/** Confidence level for significance test. 0.95 default. */
const CONFIDENCE_LEVEL = () => numEnv("REC_OUTCOME_CONFIDENCE", 0.95);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComputeOutcomeOptions {
  /** Override window start. Defaults to recommendation.approvedAt or createdAt. */
  windowStart?: Date;
  /** Override window end. Defaults to `now`. */
  windowEnd?: Date;
  /** Persist a RecommendationOutcome row. Defaults to true. */
  persist?: boolean;
}

export interface OutcomeResult {
  recommendationId: string;
  experimentId: string;
  windowStart: Date;
  windowEnd: Date;
  variantSessions: number;
  controlSessions: number;
  variantConversions: number;
  controlConversions: number;
  variantRevenue: number;
  controlRevenue: number;
  conversionDeltaPct: number;
  attributedRevenue: number;
  pValue: number;
  significant: boolean;
  decision: "ship" | "rollback" | "extend" | "inconclusive";
  /** When persist=true, the newly-created RecommendationOutcome.id. */
  outcomeId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decide(
  totalSessions: number,
  significant: boolean,
  upliftPct: number,
): OutcomeResult["decision"] {
  if (totalSessions < MIN_OUTCOME_SAMPLE()) return "inconclusive";
  if (significant) {
    return upliftPct > 0 ? "ship" : "rollback";
  }
  return upliftPct > 0 ? "extend" : "inconclusive";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute (and optionally persist) a RecommendationOutcome snapshot for an
 * approved/active Recommendation.
 */
export async function computeOutcomeForRecommendation(
  recommendationId: string,
  opts: ComputeOutcomeOptions = {},
): Promise<OutcomeResult> {
  const rec = await RecommendationRepo.getRecommendation(recommendationId);
  if (!rec) throw new Error(`Recommendation ${recommendationId} not found`);
  if (!rec.approvedExperimentId) {
    throw new Error(
      `Recommendation ${recommendationId} has no linked Experiment (status=${rec.status})`,
    );
  }

  const experimentId = rec.approvedExperimentId;

  // Determine the window FIRST so the repo query is scoped correctly.
  // Codex P1: previously the repo counted every intervention in assigned
  // sessions; now we clamp by timestamp + frictionId so revenue/conversion
  // reflect only this recommendation's experiment + window.
  const windowEnd = opts.windowEnd ?? new Date();
  const windowStart =
    opts.windowStart ??
    (rec.approvedAt ? new Date(rec.approvedAt) : new Date(rec.createdAt));

  const variantOutcomes = await ExperimentRepo.getVariantOutcomesWithRevenue(experimentId, {
    windowStart,
    windowEnd,
    frictionId: rec.frictionId,
  });

  // We expect the 2-variant {control, treatment} layout that approveRecommendation
  // creates. Be defensive in case the experiment has more or fewer variants.
  const control = variantOutcomes.find((v) => v.variantId === "control") ?? variantOutcomes[0];
  const treatment = variantOutcomes.find((v) => v.variantId === "treatment") ?? variantOutcomes[1];

  const controlSessions = control?.sessions ?? 0;
  const variantSessions = treatment?.sessions ?? 0;
  const controlConversions = control?.converted ?? 0;
  const variantConversions = treatment?.converted ?? 0;
  const controlRevenue = control?.revenue ?? 0;
  const variantRevenue = treatment?.revenue ?? 0;

  // Significance test on conversion rates (use sessions, not interventions, so
  // sessions exposed but with no intervention still count against CR).
  const controlCR = controlSessions > 0 ? controlConversions / controlSessions : 0;
  const variantCR = variantSessions > 0 ? variantConversions / variantSessions : 0;
  const sig = testSignificance(
    {
      variantId: "control", variantName: "control",
      sampleSize: controlSessions, conversionRate: controlCR,
      dismissalRate: 0, ignoreRate: 0,
      avgCompositeScore: 0, avgIntentScore: 0, avgFrictionScore: 0,
    },
    {
      variantId: "treatment", variantName: "treatment",
      sampleSize: variantSessions, conversionRate: variantCR,
      dismissalRate: 0, ignoreRate: 0,
      avgCompositeScore: 0, avgIntentScore: 0, avgFrictionScore: 0,
    },
    CONFIDENCE_LEVEL(),
  );

  const conversionDeltaPct = sig.uplift; // already (variantCR - controlCR)/controlCR * 100
  // Attributed revenue = additional dollars in the treatment arm over control.
  // Clamp at 0 (negative attribution means the recommendation hurt revenue,
  // surfaced via decision=rollback rather than negative dollars in the card).
  const attributedRevenue = Math.max(0, variantRevenue - controlRevenue);

  const decision = decide(
    controlSessions + variantSessions,
    sig.isSignificant,
    conversionDeltaPct,
  );

  const result: OutcomeResult = {
    recommendationId,
    experimentId,
    windowStart,
    windowEnd,
    variantSessions,
    controlSessions,
    variantConversions,
    controlConversions,
    variantRevenue,
    controlRevenue,
    conversionDeltaPct,
    attributedRevenue,
    pValue: sig.pValue,
    significant: sig.isSignificant,
    decision,
  };

  if (opts.persist !== false) {
    const row = await RecommendationOutcomeRepo.createOutcome({
      recommendationId,
      experimentId,
      windowStart,
      windowEnd,
      variantSessions,
      controlSessions,
      variantConversions,
      controlConversions,
      conversionDeltaPct,
      attributedRevenue,
      pValue: sig.pValue,
      decision,
    });
    result.outcomeId = row.id;
  }

  log.info(
    {
      recommendationId,
      experimentId,
      decision,
      attributedRevenue,
      conversionDeltaPct: conversionDeltaPct.toFixed(2),
      pValue: sig.pValue,
      sample: controlSessions + variantSessions,
    },
    "[Recommendation outcome] computed",
  );
  return result;
}

/**
 * List historical outcome snapshots for a Recommendation.
 */
export async function listOutcomes(recommendationId: string) {
  return RecommendationOutcomeRepo.listByRecommendation(recommendationId);
}

/**
 * Build a dashboard "summary" view: for each approved/active recommendation
 * on the site, attach its latest outcome (or null). Cheap because we batch
 * the recommendations query and accept one outcome query per row — typical
 * sites have <50 approved recs at any time.
 */
export async function summaryForSite(siteUrl: string, limit = 50) {
  // Codex P2 #3 — scope the repo query to approved/active. Previously the
  // post-fetch filter could drop an older approved row when many newer
  // pending/rejected rows existed within the latest-`limit` window.
  const recs = (await RecommendationRepo.listBySite(siteUrl, {
    statuses: ["approved", "active"],
    limit,
  })) as Array<{ id: string; status: string; [k: string]: unknown }>;
  const enriched = await Promise.all(
    recs.map(async (rec) => {
      const outcomes = await RecommendationOutcomeRepo.listByRecommendation(rec.id);
      return { ...rec, latestOutcome: outcomes[0] ?? null };
    }),
  );
  return enriched;
}
