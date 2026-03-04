import { EvaluationRepo, InterventionRepo, SessionRepo } from "@ava/db";
import { buildContext } from "./context-builder.js";
import { evaluateWithLLM } from "./analyst.js";
import { runMSWIM, type SessionContext } from "./mswim/mswim.engine.js";
import { ScoreTier } from "@ava/shared";
import { config } from "../config.js";
import { runShadowEvaluation } from "./shadow-evaluator.js";
import { logShadowComparison } from "./shadow-logger.js";
import { runFastEvaluation, shouldEscalateToLLM, inferFrictionFromContext } from "./fast-evaluator.js";
import { resolveExperimentOverrides } from "../experiment/experiment-resolver.js";
import type { ExperimentOverrides } from "@ava/shared";

export interface EvaluationResult {
  evaluationId: string;
  decision: "fire" | "suppress" | "queue";
  tier: string;
  compositeScore: number;
  interventionType: string | null;
  frictionIds: string[];
  narrative: string;
  signals: { intent: number; friction: number; clarity: number; receptivity: number; value: number };
  reasoning: string;
  recommendedAction: string;
  engine: "llm" | "fast";
  gateOverride?: string | null;
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

function mapTierToDefaultAction(tier: string): string {
  switch (tier) {
    case "PASSIVE":
      return "passive_info_adjust";
    case "NUDGE":
      return "nudge_suggestion";
    case "ACTIVE":
      return "active_comparison";
    case "ESCALATE":
      return "escalate_full_assist";
    default:
      return "none";
  }
}

const TIER_LABELS: Record<ScoreTier, string> = {
  [ScoreTier.MONITOR]: "MONITOR",
  [ScoreTier.PASSIVE]: "PASSIVE",
  [ScoreTier.NUDGE]: "NUDGE",
  [ScoreTier.ACTIVE]: "ACTIVE",
  [ScoreTier.ESCALATE]: "ESCALATE",
};

const INTERVENTION_TYPE_MAP: Record<ScoreTier, string | null> = {
  [ScoreTier.MONITOR]: null,
  [ScoreTier.PASSIVE]: "passive",
  [ScoreTier.NUDGE]: "nudge",
  [ScoreTier.ACTIVE]: "active",
  [ScoreTier.ESCALATE]: "escalate",
};

/**
 * Run the evaluation pipeline for a batch of events.
 *
 * Engine selection priority:
 *   1. Experiment override (if session is in an active experiment)
 *   2. EVAL_ENGINE env var / config
 *
 * Modes: "llm" | "fast" | "auto"
 */
export async function evaluateEventBatch(
  sessionId: string,
  eventIds: string[]
): Promise<EvaluationResult | null> {
  // Resolve experiment overrides (non-blocking on failure)
  const session = await SessionRepo.getSession(sessionId);
  const siteUrl = session?.siteUrl;
  const overrides = await resolveExperimentOverrides(sessionId, siteUrl);

  // Apply experiment engine override or use config default
  const engine = overrides?.evalEngine ?? config.evalEngine;

  // Store overrides for MSWIM config loading (passed via sessionId context)
  if (overrides?.scoringConfigId) {
    _experimentConfigOverrides.set(sessionId, overrides.scoringConfigId);
  }

  console.log(`[Evaluate] Starting evaluation for session ${sessionId}, engine=${engine}, events=${eventIds.length}`);
  try {
    if (engine === "fast") {
      return await evaluateFast(sessionId, eventIds);
    }

    if (engine === "auto") {
      return await evaluateAuto(sessionId, eventIds);
    }

    // Default: "llm"
    return await evaluateLLM(sessionId, eventIds);
  } catch (err) {
    console.error(`[Evaluate] ❌ Engine error (${engine}) for session ${sessionId}:`, err);
    throw err;
  } finally {
    // Clean up per-session override
    _experimentConfigOverrides.delete(sessionId);
  }
}

/**
 * Per-session experiment config overrides. Set before MSWIM runs,
 * cleaned up after evaluation completes. Thread-safe for single-threaded Node.
 */
export const _experimentConfigOverrides = new Map<string, string>();

/**
 * Get the experiment scoring config override for a session, if any.
 */
export function getExperimentConfigOverride(sessionId: string): string | undefined {
  return _experimentConfigOverrides.get(sessionId);
}

// ── Fast engine path ──────────────────────────────────────────────────────────

async function evaluateFast(
  sessionId: string,
  eventIds: string[]
): Promise<EvaluationResult | null> {
  const { sessionCtx, frictionIds } = await buildSessionAndFrictions(sessionId, eventIds);
  if (!sessionCtx) return null;

  const fastResult = await runFastEvaluation({
    sessionCtx,
    detectedFrictionIds: frictionIds,
    pageType: sessionCtx.pageType,
    eventCount: sessionCtx.eventCount,
  });

  const { mswimResult, narrative, reasoning } = fastResult;
  const tierLabel = TIER_LABELS[mswimResult.tier];
  const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];

  const evaluation = await EvaluationRepo.createEvaluation({
    sessionId,
    eventBatchIds: JSON.stringify(eventIds),
    narrative,
    frictionsFound: JSON.stringify(frictionIds),
    intentScore: mswimResult.signals.intent,
    frictionScore: mswimResult.signals.friction,
    clarityScore: mswimResult.signals.clarity,
    receptivityScore: mswimResult.signals.receptivity,
    valueScore: mswimResult.signals.value,
    compositeScore: mswimResult.composite_score,
    weightsUsed: JSON.stringify(mswimResult.weights_used),
    tier: tierLabel,
    decision: mswimResult.decision,
    gateOverride: mswimResult.gate_override?.toString() ?? undefined,
    interventionType: interventionType ?? undefined,
    reasoning,
  });

  return {
    evaluationId: evaluation.id,
    decision: mswimResult.decision,
    tier: tierLabel,
    compositeScore: mswimResult.composite_score,
    interventionType,
    frictionIds,
    narrative,
    signals: mswimResult.signals,
    reasoning,
    recommendedAction: mapTierToDefaultAction(tierLabel),
    engine: "fast",
    gateOverride: mswimResult.gate_override?.toString() ?? null,
  };
}

// ── Auto engine path (fast first, LLM fallback) ──────────────────────────────

async function evaluateAuto(
  sessionId: string,
  eventIds: string[]
): Promise<EvaluationResult | null> {
  const { sessionCtx, frictionIds, context } = await buildSessionAndFrictions(sessionId, eventIds);
  if (!sessionCtx) return null;

  // 1. Run fast engine
  const fastResult = await runFastEvaluation({
    sessionCtx,
    detectedFrictionIds: frictionIds,
    pageType: sessionCtx.pageType,
    eventCount: sessionCtx.eventCount,
  });

  // 2. Check if we should escalate to LLM
  if (shouldEscalateToLLM(fastResult) && context) {
    console.log(`[Evaluate:auto] Escalating to LLM for session ${sessionId} (composite=${fastResult.mswimResult.composite_score.toFixed(1)})`);
    return evaluateLLM(sessionId, eventIds);
  }

  // 3. Use fast result
  const { mswimResult, narrative, reasoning } = fastResult;
  const tierLabel = TIER_LABELS[mswimResult.tier];
  const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];

  const evaluation = await EvaluationRepo.createEvaluation({
    sessionId,
    eventBatchIds: JSON.stringify(eventIds),
    narrative,
    frictionsFound: JSON.stringify(frictionIds),
    intentScore: mswimResult.signals.intent,
    frictionScore: mswimResult.signals.friction,
    clarityScore: mswimResult.signals.clarity,
    receptivityScore: mswimResult.signals.receptivity,
    valueScore: mswimResult.signals.value,
    compositeScore: mswimResult.composite_score,
    weightsUsed: JSON.stringify(mswimResult.weights_used),
    tier: tierLabel,
    decision: mswimResult.decision,
    gateOverride: mswimResult.gate_override?.toString() ?? undefined,
    interventionType: interventionType ?? undefined,
    reasoning,
  });

  return {
    evaluationId: evaluation.id,
    decision: mswimResult.decision,
    tier: tierLabel,
    compositeScore: mswimResult.composite_score,
    interventionType,
    frictionIds,
    narrative,
    signals: mswimResult.signals,
    reasoning,
    recommendedAction: mapTierToDefaultAction(tierLabel),
    engine: "fast",
    gateOverride: mswimResult.gate_override?.toString() ?? null,
  };
}

// ── Full LLM engine path ─────────────────────────────────────────────────────

async function evaluateLLM(
  sessionId: string,
  eventIds: string[]
): Promise<EvaluationResult | null> {
  // 1. Build context
  console.log(`[Evaluate:llm] Building context for session ${sessionId}`);
  const context = await buildContext(sessionId, eventIds);
  if (!context) {
    console.error(`[Evaluate:llm] Session ${sessionId} not found — buildContext returned null`);
    return null;
  }
  console.log(`[Evaluate:llm] Context built — ${context.newEvents.length} new events, ${context.eventHistory.length} history events`);

  // 2. Call LLM
  console.log(`[Evaluate:llm] Calling Groq LLM for session ${sessionId}...`);
  const llmOutput = await evaluateWithLLM(context);
  console.log(`[Evaluate:llm] LLM response received — tier signals: I=${llmOutput.signals.intent} F=${llmOutput.signals.friction}`);

  // 3. Build session context for MSWIM
  const [session, history] = await Promise.all([
    SessionRepo.getSession(sessionId),
    loadInterventionHistory(sessionId),
  ]);
  if (!session) return null;

  const sessionAgeSec = Math.floor(
    (Date.now() - session.startedAt.getTime()) / 1000
  );

  const sessionCtx: SessionContext = {
    sessionId,
    siteUrl: session.siteUrl,
    sessionAgeSec,
    pageType: (context.newEvents[context.newEvents.length - 1]?.pageType as string) ?? "other",
    isLoggedIn: session.isLoggedIn,
    isRepeatVisitor: session.isRepeatVisitor,
    cartValue: session.cartValue,
    cartItemCount: session.cartItemCount,
    deviceType: session.deviceType,
    referrerType: session.referrerType,
    eventCount: context.newEvents.length,
    ruleBasedCorroboration: llmOutput.detected_frictions.length > 0,
    totalInterventionsFired: session.totalInterventionsFired,
    totalDismissals: session.totalDismissals,
    totalNudges: history.totalNudges,
    totalActive: history.totalActive,
    totalNonPassive: history.totalNudges + history.totalActive,
    secondsSinceLastIntervention: history.secondsSinceLastIntervention,
    secondsSinceLastActive: history.secondsSinceLastActive,
    secondsSinceLastNudge: history.secondsSinceLastNudge,
    secondsSinceLastDismissal: history.secondsSinceLastDismissal,
    frictionIdsAlreadyIntervened: history.frictionIdsAlreadyIntervened,
    widgetOpenedVoluntarily: false, // TODO: surface from widget open events
    idleSeconds: 0, // TODO: surface from idle_time events
    hasTechnicalError: llmOutput.detected_frictions.some(
      (id) => id >= "F161" && id <= "F177"
    ),
    hasOutOfStock: llmOutput.detected_frictions.includes("F053"),
    hasShippingIssue: llmOutput.detected_frictions.some(
      (id) => id >= "F236" && id <= "F247"
    ),
    hasPaymentFailure: llmOutput.detected_frictions.some(
      (id) => id === "F096" || id === "F097"
    ),
    hasCheckoutTimeout: llmOutput.detected_frictions.includes("F112"),
    hasHelpSearch: llmOutput.detected_frictions.includes("F036"),
    scoringConfigId: _experimentConfigOverrides.get(sessionId),
  };

  // 4. Compute effective frictionIds BEFORE MSWIM so Gate 3 (duplicate friction)
  //    sees the same frictionId that will be stored on the intervention.
  //    Raw LLM output may be [] on generic page views; inferFrictionFromContext
  //    provides the canonical fallback that the intervention record will use.
  const effectiveFrictionIdsForMSWIM =
    llmOutput.detected_frictions.length > 0
      ? llmOutput.detected_frictions
      : [inferFrictionFromContext(sessionCtx)];

  // 4. Run MSWIM engine
  const mswimResult = await runMSWIM(
    {
      intent: llmOutput.signals.intent,
      friction: llmOutput.signals.friction,
      clarity: llmOutput.signals.clarity,
      receptivity: llmOutput.signals.receptivity,
      value: llmOutput.signals.value,
      detectedFrictionIds: effectiveFrictionIdsForMSWIM,
      recommendedAction: llmOutput.recommended_action,
    },
    sessionCtx
  );

  const tierLabel = TIER_LABELS[mswimResult.tier];
  const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];

  // 5. Persist evaluation
  const evaluation = await EvaluationRepo.createEvaluation({
    sessionId,
    eventBatchIds: JSON.stringify(eventIds),
    narrative: llmOutput.narrative,
    frictionsFound: JSON.stringify(llmOutput.detected_frictions),
    intentScore: mswimResult.signals.intent,
    frictionScore: mswimResult.signals.friction,
    clarityScore: mswimResult.signals.clarity,
    receptivityScore: mswimResult.signals.receptivity,
    valueScore: mswimResult.signals.value,
    compositeScore: mswimResult.composite_score,
    weightsUsed: JSON.stringify(mswimResult.weights_used),
    tier: tierLabel,
    decision: mswimResult.decision,
    gateOverride: mswimResult.gate_override?.toString() ?? undefined,
    interventionType: interventionType ?? undefined,
    reasoning: mswimResult.reasoning,
  });

  // === SHADOW MODE: Run MSWIM-no-LLM in background (non-blocking) ===
  if (config.shadow.enabled) {
    const eventFrictionIds = context.newEvents
      .map((e) => e.frictionId as string | null)
      .filter((id): id is string => id !== null);
    const allFrictionIds = [
      ...new Set([...eventFrictionIds, ...llmOutput.detected_frictions]),
    ];

    runShadowEvaluation({
      sessionCtx,
      detectedFrictionIds: allFrictionIds,
      pageType: sessionCtx.pageType,
      eventCount: sessionCtx.eventCount,
    })
      .then((shadow) =>
        logShadowComparison({
          sessionId,
          evaluationId: evaluation.id,
          prodResult: mswimResult,
          shadowResult: shadow.shadowResult,
          syntheticHints: shadow.syntheticHints,
          pageType: sessionCtx.pageType,
          eventCount: sessionCtx.eventCount,
          cartValue: sessionCtx.cartValue,
        })
      )
      .catch((err) =>
        console.error("[Shadow] Failed (non-blocking):", err)
      );
  }

  return {
    evaluationId: evaluation.id,
    decision: mswimResult.decision,
    tier: tierLabel,
    compositeScore: mswimResult.composite_score,
    interventionType,
    // Apply the same inferFrictionFromContext fallback used by fast/auto paths:
    // when the LLM returns no frictions (parse-fail or genuinely empty), avoid
    // propagating frictionId="unknown" through the intervene pipeline.
    frictionIds: llmOutput.detected_frictions.length > 0
      ? llmOutput.detected_frictions
      : [inferFrictionFromContext(sessionCtx)],
    narrative: llmOutput.narrative,
    signals: mswimResult.signals,
    reasoning: mswimResult.reasoning,
    recommendedAction: llmOutput.recommended_action,
    engine: "llm",
    gateOverride: mswimResult.gate_override?.toString() ?? null,
  };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

interface InterventionHistory {
  totalNudges: number;
  totalActive: number;
  secondsSinceLastIntervention: number | null;
  secondsSinceLastActive: number | null;
  secondsSinceLastNudge: number | null;
  secondsSinceLastDismissal: number | null;
  frictionIdsAlreadyIntervened: string[];
}

async function loadInterventionHistory(sessionId: string): Promise<InterventionHistory> {
  const all = await InterventionRepo.getInterventionsBySession(sessionId);
  const now = Date.now();

  const totalNudges = all.filter((i) => i.type === "nudge").length;
  const totalActive = all.filter(
    (i) => i.type === "active" || i.type === "escalate"
  ).length;

  const lastAny = all[0]; // already desc by timestamp
  const lastActive = all.find((i) => i.type === "active" || i.type === "escalate");
  const lastNudge = all.find((i) => i.type === "nudge");
  const lastDismissed = all.find((i) => i.status === "dismissed");

  const secsSince = (i: { timestamp: Date } | undefined): number | null =>
    i ? Math.floor((now - i.timestamp.getTime()) / 1000) : null;

  const frictionIdsAlreadyIntervened = [
    ...new Set(all.map((i) => i.frictionId).filter((id): id is string => !!id)),
  ];

  return {
    totalNudges,
    totalActive,
    secondsSinceLastIntervention: secsSince(lastAny),
    secondsSinceLastActive: secsSince(lastActive),
    secondsSinceLastNudge: secsSince(lastNudge),
    secondsSinceLastDismissal: secsSince(lastDismissed),
    frictionIdsAlreadyIntervened,
  };
}

import type { EvaluationContext } from "./context-builder.js";

/**
 * Build session context + extract friction IDs from events.
 * Shared by fast and auto engine paths.
 */
async function buildSessionAndFrictions(
  sessionId: string,
  eventIds: string[]
): Promise<{
  sessionCtx: SessionContext | null;
  frictionIds: string[];
  context: EvaluationContext | null;
}> {
  const [context, session, history] = await Promise.all([
    buildContext(sessionId, eventIds),
    SessionRepo.getSession(sessionId),
    loadInterventionHistory(sessionId),
  ]);

  if (!context) {
    console.error(`[Evaluate] Session ${sessionId} not found`);
    return { sessionCtx: null, frictionIds: [], context: null };
  }
  if (!session) return { sessionCtx: null, frictionIds: [], context: null };

  // Extract friction IDs from events (client-reported)
  const frictionIds = [
    ...new Set(
      context.newEvents
        .map((e) => e.frictionId as string | null)
        .filter((id): id is string => id !== null)
    ),
  ];

  const sessionAgeSec = Math.floor(
    (Date.now() - session.startedAt.getTime()) / 1000
  );

  const sessionCtx: SessionContext = {
    sessionId,
    siteUrl: session.siteUrl,
    sessionAgeSec,
    pageType: (context.newEvents[context.newEvents.length - 1]?.pageType as string) ?? "other",
    isLoggedIn: session.isLoggedIn,
    isRepeatVisitor: session.isRepeatVisitor,
    cartValue: session.cartValue,
    cartItemCount: session.cartItemCount,
    deviceType: session.deviceType,
    referrerType: session.referrerType,
    eventCount: context.newEvents.length,
    ruleBasedCorroboration: frictionIds.length > 0,
    totalInterventionsFired: session.totalInterventionsFired,
    totalDismissals: session.totalDismissals,
    totalNudges: history.totalNudges,
    totalActive: history.totalActive,
    totalNonPassive: history.totalNudges + history.totalActive,
    secondsSinceLastIntervention: history.secondsSinceLastIntervention,
    secondsSinceLastActive: history.secondsSinceLastActive,
    secondsSinceLastNudge: history.secondsSinceLastNudge,
    secondsSinceLastDismissal: history.secondsSinceLastDismissal,
    frictionIdsAlreadyIntervened: history.frictionIdsAlreadyIntervened,
    widgetOpenedVoluntarily: false, // TODO: surface from widget open events
    idleSeconds: 0, // TODO: surface from idle_time events
    hasTechnicalError: frictionIds.some(
      (id) => id >= "F161" && id <= "F177"
    ),
    hasOutOfStock: frictionIds.includes("F053"),
    hasShippingIssue: frictionIds.some(
      (id) => id >= "F236" && id <= "F247"
    ),
    hasPaymentFailure: frictionIds.some(
      (id) => id === "F096" || id === "F097"
    ),
    hasCheckoutTimeout: frictionIds.includes("F112"),
    hasHelpSearch: frictionIds.includes("F036"),
    scoringConfigId: _experimentConfigOverrides.get(sessionId),
  };

  // If no event-level friction IDs were detected, infer the most contextually
  // relevant one from session state (page type, cart, gate flags).
  // This fixes frictionId="unknown" on generic browse events.
  const effectiveFrictionIds =
    frictionIds.length > 0
      ? frictionIds
      : [inferFrictionFromContext(sessionCtx)];

  return { sessionCtx, frictionIds: effectiveFrictionIds, context };
}
