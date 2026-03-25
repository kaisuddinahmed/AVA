// ============================================================================
// Training Data Collector — snapshots evaluation + outcome into TrainingDatapoint
// Called after an intervention reaches a terminal outcome.
// ============================================================================

import {

  TrainingDatapointRepo,
  InterventionRepo,
  EvaluationRepo,
  SessionRepo,
  EventRepo,
} from "@ava/db";

import { logger } from "../logger.js";
const log = logger.child({ service: "training" });

/** Terminal outcomes worth capturing as training data */
const TERMINAL_OUTCOMES = new Set(["dismissed", "converted", "ignored"]);

/**
 * Snapshot the full decision cycle into a TrainingDatapoint.
 * Called from recordInterventionOutcome after the outcome is persisted.
 *
 * Non-terminal outcomes (e.g. "delivered") are skipped — they're
 * intermediate states, not labels we can train on.
 */
export async function captureTrainingDatapoint(
  interventionId: string,
  outcome: string
): Promise<string | null> {
  // Only capture terminal outcomes
  if (!TERMINAL_OUTCOMES.has(outcome)) return null;

  // Skip if already captured (idempotent)
  const existing =
    await TrainingDatapointRepo.getDatapointByInterventionId(interventionId);
  if (existing) return existing.id;

  // Load the full chain: intervention → evaluation → session + events
  const intervention = await InterventionRepo.getIntervention(interventionId);
  if (!intervention || !intervention.evaluation) {
    log.warn(
      `[TrainingCollector] Intervention ${interventionId} not found or missing evaluation`
    );
    return null;
  }

  const evaluation = intervention.evaluation;
  const session = await SessionRepo.getSession(intervention.sessionId);
  if (!session) {
    log.warn(
      `[TrainingCollector] Session ${intervention.sessionId} not found`
    );
    return null;
  }

  // Load the events that fed this evaluation
  let rawEventData = "[]";
  let pageType = "other";
  try {
    const eventIds = JSON.parse(evaluation.eventBatchIds) as string[];
    const events = await EventRepo.getEventsByIds(eventIds);
    rawEventData = JSON.stringify(
      events.map((e) => ({
        category: e.category,
        eventType: e.eventType,
        frictionId: e.frictionId,
        pageType: e.pageType,
        rawSignals: e.rawSignals,
      }))
    );
    // Use the page type from the most recent event in the batch
    if (events.length > 0) {
      pageType = events[events.length - 1].pageType;
    }
  } catch {
    // If event batch parsing fails, continue with empty data
    log.warn(
      `[TrainingCollector] Failed to parse event batch for evaluation ${evaluation.id}`
    );
  }

  // Calculate session age at evaluation time
  const sessionAgeSec = Math.round(
    (evaluation.timestamp.getTime() - session.startedAt.getTime()) / 1000
  );

  // Calculate outcome delay
  let outcomeDelayMs: number | undefined;
  const outcomeTimestamp =
    intervention.dismissedAt ??
    intervention.convertedAt ??
    intervention.ignoredAt;
  if (outcomeTimestamp) {
    outcomeDelayMs = outcomeTimestamp.getTime() - intervention.timestamp.getTime();
  }

  // Build quality flags
  const qualityFlags = JSON.stringify({
    hasOutcome: true,
    hasEvents: rawEventData !== "[]",
    hasNarrative: evaluation.narrative.length > 0,
    hasFrictions: evaluation.frictionsFound !== "[]",
    sessionAgeSec,
    eventCount: JSON.parse(evaluation.eventBatchIds).length,
    outcomeDelayMs,
  });

  // Create the denormalized training datapoint
  const datapoint = await TrainingDatapointRepo.createDatapoint({
    sessionId: session.id,
    evaluationId: evaluation.id,
    interventionId: intervention.id,

    // Session context
    siteUrl: session.siteUrl,
    deviceType: session.deviceType,
    referrerType: session.referrerType,
    isLoggedIn: session.isLoggedIn,
    isRepeatVisitor: session.isRepeatVisitor,
    cartValue: session.cartValue,
    cartItemCount: session.cartItemCount,
    sessionAgeSec,
    totalInterventionsFired: session.totalInterventionsFired,
    totalDismissals: session.totalDismissals,
    totalConversions: session.totalConversions,

    // LLM input
    eventBatchIds: evaluation.eventBatchIds,
    rawEventData,
    pageType,

    // LLM output
    narrative: evaluation.narrative,
    frictionsFound: evaluation.frictionsFound,

    // MSWIM scores
    intentScore: evaluation.intentScore,
    frictionScore: evaluation.frictionScore,
    clarityScore: evaluation.clarityScore,
    receptivityScore: evaluation.receptivityScore,
    valueScore: evaluation.valueScore,
    compositeScore: evaluation.compositeScore,
    weightsUsed: evaluation.weightsUsed,
    tier: evaluation.tier,
    decision: evaluation.decision,
    gateOverride: evaluation.gateOverride ?? undefined,

    // Intervention
    interventionType: intervention.type,
    actionCode: intervention.actionCode,
    frictionId: intervention.frictionId,
    mswimScoreAtFire: intervention.mswimScoreAtFire,
    tierAtFire: intervention.tierAtFire,

    // Outcome
    outcome,
    conversionAction: intervention.conversionAction ?? undefined,
    outcomeDelayMs,

    // Quality
    qualityFlags,
  });

  log.info(
    `[TrainingCollector] Captured datapoint ${datapoint.id} | ` +
      `intervention=${interventionId} outcome=${outcome} tier=${evaluation.tier} ` +
      `composite=${evaluation.compositeScore.toFixed(1)}`
  );

  return datapoint.id;
}
