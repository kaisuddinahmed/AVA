// ============================================================================
// Fast Evaluator — Single-call MSWIM evaluation with zero LLM calls.
//
// Uses rule-derived synthetic signals (same approach as shadow evaluator)
// as the PRIMARY evaluation path. Detects frictions from event data,
// synthesizes MSWIM signal hints, and runs the full MSWIM engine.
//
// Trade-off: No LLM narrative/reasoning, but ~0ms latency vs ~1-3s LLM call.
// ============================================================================

import { getSeverity } from "@ava/shared";
import { runMSWIM, type LLMOutput, type SessionContext } from "./mswim/mswim.engine.js";
import type { MSWIMResult } from "@ava/shared";

// Synthetic intent base scores by page type (intentionally low —
// adjustIntent() adds INTENT_FUNNEL_SCORES on top)
const SYNTHETIC_INTENT_BASE: Record<string, number> = {
  landing: 10,
  category: 15,
  search_results: 18,
  pdp: 25,
  cart: 30,
  checkout: 35,
  account: 12,
  other: 10,
};

export interface FastEvalInput {
  sessionCtx: SessionContext;
  detectedFrictionIds: string[];
  pageType: string;
  eventCount: number;
  /** Optional scroll depth and session sequence from the most recent event */
  latestScrollDepthPct?: number;
  latestSessionSequence?: number;
  priorExitIntentCount?: number;
}

export interface FastEvalResult {
  mswimResult: MSWIMResult;
  syntheticHints: LLMOutput;
  narrative: string;
  reasoning: string;
  engine: "fast";
  abandonmentScore: number;
}

/**
 * Run a fast evaluation with zero LLM calls.
 * Same MSWIM engine, rule-derived signal hints.
 */
export async function runFastEvaluation(
  input: FastEvalInput
): Promise<FastEvalResult> {
  const { sessionCtx, detectedFrictionIds, pageType, eventCount,
          latestScrollDepthPct = 0, latestSessionSequence = 0, priorExitIntentCount = 0 } = input;

  // ── 1. Synthesize intent hint ──────────────────────────────────────────
  let syntheticIntent = SYNTHETIC_INTENT_BASE[pageType] ?? 10;
  if (sessionCtx.isLoggedIn) syntheticIntent += 5;
  if (sessionCtx.isRepeatVisitor) syntheticIntent += 5;
  if (sessionCtx.cartItemCount > 0) syntheticIntent += 8;
  syntheticIntent = clamp(syntheticIntent);

  // ── 2. Synthesize friction hint ────────────────────────────────────────
  let syntheticFriction = 10;
  if (detectedFrictionIds.length > 0) {
    const severities = detectedFrictionIds.map((id) => getSeverity(id));
    syntheticFriction = Math.max(...severities);
  }
  syntheticFriction = clamp(syntheticFriction);

  // ── 3. Synthesize clarity hint ─────────────────────────────────────────
  let syntheticClarity = 40;
  if (detectedFrictionIds.length > 0) syntheticClarity += 15;
  if (eventCount >= 5) syntheticClarity += 10;
  if (sessionCtx.sessionAgeSec > 120) syntheticClarity += 10;
  syntheticClarity = clamp(syntheticClarity);

  // ── 4. Synthesize receptivity hint ─────────────────────────────────────
  const syntheticReceptivity = 50;

  // ── 5. Synthesize value hint ───────────────────────────────────────────
  let syntheticValue = 25;
  if (sessionCtx.cartValue > 50) syntheticValue = 35;
  if (sessionCtx.cartValue > 100) syntheticValue = 50;
  if (sessionCtx.cartValue > 200) syntheticValue = 65;
  if (sessionCtx.isLoggedIn) syntheticValue += 8;
  if (sessionCtx.isRepeatVisitor) syntheticValue += 8;
  syntheticValue = clamp(syntheticValue);

  // ── 6. Build synthetic LLMOutput ───────────────────────────────────────
  const syntheticHints: LLMOutput = {
    intent: syntheticIntent,
    friction: syntheticFriction,
    clarity: syntheticClarity,
    receptivity: syntheticReceptivity,
    value: syntheticValue,
    detectedFrictionIds,
    recommendedAction: "monitor",
  };

  // ── 7. Run MSWIM engine ────────────────────────────────────────────────
  const mswimResult = await runMSWIM(syntheticHints, sessionCtx);

  // ── 8. Compute predictive abandonment score ────────────────────────────
  const abandonmentScore = computeAbandonmentScore({
    sessionAgeSec: sessionCtx.sessionAgeSec,
    pageType,
    cartValue: sessionCtx.cartValue,
    cartItemCount: sessionCtx.cartItemCount,
    scrollDepthPct: latestScrollDepthPct,
    sessionSequence: latestSessionSequence,
    priorExitIntentCount,
    detectedFrictionIds,
    compositeScore: mswimResult.composite_score,
  });

  // ── 9. Build rule-based narrative and reasoning ────────────────────────
  const narrative = buildFastNarrative(sessionCtx, detectedFrictionIds, mswimResult);
  const reasoning = buildFastReasoning(mswimResult, detectedFrictionIds);

  return {
    mswimResult,
    syntheticHints,
    narrative,
    reasoning,
    engine: "fast",
    abandonmentScore,
  };
}

/**
 * Determine if this evaluation should escalate to the full LLM path.
 * Used in "auto" engine mode to decide when the fast path isn't enough.
 */
export function shouldEscalateToLLM(
  fastResult: FastEvalResult
): boolean {
  const { mswimResult, syntheticHints, abandonmentScore } = fastResult;

  // Escalate if composite score is in ACTIVE+ range — LLM provides
  // better narrative for high-stakes interventions
  if (mswimResult.composite_score >= 65) return true;

  // Escalate if high-severity friction detected (severity >= 75)
  const maxSeverity = syntheticHints.detectedFrictionIds.length > 0
    ? Math.max(...syntheticHints.detectedFrictionIds.map((id) => getSeverity(id)))
    : 0;
  if (maxSeverity >= 75) return true;

  // Escalate if a gate forced escalation
  if (mswimResult.gate_override?.startsWith("FORCE_ESCALATE")) return true;

  // Escalate on imminent abandonment risk — high-value moment requires LLM nuance
  if (abandonmentScore >= 80) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Abandonment Score
// ---------------------------------------------------------------------------

interface AbandonmentInput {
  sessionAgeSec: number;
  pageType: string;
  cartValue: number;
  cartItemCount: number;
  scrollDepthPct: number;
  sessionSequence: number;
  priorExitIntentCount: number;
  detectedFrictionIds: string[];
  compositeScore: number;
}

/**
 * Compute a 0–100 abandonment risk score from session behavioural signals.
 * Higher = more likely to abandon. Does NOT call LLM.
 */
export function computeAbandonmentScore(input: AbandonmentInput): number {
  let score = 0;

  // Session age without conversion — long browsing without action is risky
  if (input.sessionAgeSec > 600) score += 20;       // 10+ min
  else if (input.sessionAgeSec > 300) score += 10;   // 5+ min
  else if (input.sessionAgeSec > 180) score += 5;    // 3+ min

  // Cart state: value in cart but not checking out is a strong signal
  if (input.cartItemCount > 0 && input.pageType !== "checkout") {
    score += 15;
    if (input.cartValue > 0) score += 5; // has monetary value
  }

  // Page type — some pages have higher inherent abandonment risk
  const pageRisk: Record<string, number> = {
    cart: 15,
    checkout: 10,
    pdp: 5,
    category: 3,
  };
  score += pageRisk[input.pageType] ?? 0;

  // Exit intent events are very strong signals
  score += Math.min(input.priorExitIntentCount * 15, 30);

  // Low scroll depth on a product page = shallow engagement
  if (input.pageType === "pdp" && input.scrollDepthPct < 30) score += 8;

  // Minimal events = low engagement
  if (input.sessionSequence < 3) score += 10;
  else if (input.sessionSequence < 6) score += 5;

  // Friction detected amplifies abandonment risk
  score += Math.min(input.detectedFrictionIds.length * 5, 15);

  // High MSWIM composite already captures intervention need; add moderate weight
  if (input.compositeScore >= 50) score += 5;

  return clamp(score);
}

function buildFastNarrative(
  ctx: SessionContext,
  frictionIds: string[],
  result: MSWIMResult
): string {
  const parts: string[] = [];

  // Page context
  parts.push(`Visitor on ${ctx.pageType} page.`);

  // Session state
  if (ctx.isLoggedIn) parts.push("Logged-in user.");
  if (ctx.isRepeatVisitor) parts.push("Returning visitor.");
  if (ctx.cartValue > 0) parts.push(`Cart: $${ctx.cartValue.toFixed(2)}.`);

  // Behavior groups
  if (ctx.activeBehaviorGroups.length > 0) {
    parts.push(`Behavior: ${ctx.activeBehaviorGroups.join(", ")}.`);
  }

  // Friction
  if (frictionIds.length > 0) {
    parts.push(`Detected friction: ${frictionIds.join(", ")}.`);
  } else {
    parts.push("No friction detected.");
  }

  // Decision
  parts.push(`Score: ${result.composite_score.toFixed(1)} → ${result.tier}.`);

  return parts.join(" ");
}

function buildFastReasoning(
  result: MSWIMResult,
  frictionIds: string[]
): string {
  const parts: string[] = [];

  parts.push(`[fast-engine] Composite=${result.composite_score.toFixed(1)} → ${result.tier}.`);
  parts.push(
    `Signals: I=${result.signals.intent} F=${result.signals.friction} C=${result.signals.clarity} R=${result.signals.receptivity} V=${result.signals.value}.`
  );

  if (frictionIds.length > 0) {
    parts.push(`Frictions: ${frictionIds.join(", ")}.`);
  }

  if (result.gate_override) {
    parts.push(`Gate: ${result.gate_override} → ${result.decision}.`);
  } else {
    parts.push(`Decision: ${result.decision}.`);
  }

  return parts.join(" ");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Infer the most contextually relevant frictionId when no event-level
 * friction was detected. Uses session state (page type, cart, flags) to
 * pick the most likely friction the visitor is experiencing.
 *
 * Priority order: specific gate flags > page type > cart state.
 * Returned frictionId feeds message template selection and voice scripts.
 */
export function inferFrictionFromContext(ctx: SessionContext): string {
  // Specific gate-flag frictions (highest priority — these are definitive)
  if (ctx.hasPaymentFailure)  return "F096"; // payment failure
  if (ctx.hasTechnicalError)  return "F161"; // technical/JS error
  if (ctx.hasOutOfStock)      return "F053"; // out of stock
  if (ctx.hasShippingIssue)   return "F236"; // shipping concern
  if (ctx.hasCheckoutTimeout) return "F112"; // checkout timeout
  if (ctx.hasHelpSearch)      return "F036"; // searched for help

  // Page-type based inference
  switch (ctx.pageType) {
    case "checkout":
      return "F089"; // general checkout friction
    case "cart":
      // Idle with cart is the primary signal — visitor has value but isn't moving
      return ctx.cartValue > 0 && ctx.sessionAgeSec > 120 ? "F069" : "F068";
    case "pdp":
      // No cart yet → product consideration friction; cart exists → hesitation
      return ctx.cartValue === 0 ? "F042" : "F015";
    case "search_results":
      return "F028"; // search navigation friction
    case "category":
      return "F013"; // navigation difficulty
    case "landing":
    default:
      return "F002"; // bounce risk — most conservative inference
  }
}
