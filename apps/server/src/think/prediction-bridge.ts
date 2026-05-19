// ============================================================================
// think/prediction-bridge — translates SalespersonMove ↔ MoveOutcome.
//
// Step 7 (2026-05-19). Two thin helpers:
//   - recordMovePrediction: stamps a pending MoveOutcome at intervene-fire.
//   - resolvePendingForSession: scores the latest pending prediction
//     against the live evaluation, marking it resolved.
//
// Both are best-effort: errors are swallowed and logged. The intervene
// path must never fail because the prediction layer hiccups.
// ============================================================================

import { MoveOutcomeRepo, VisitorMindRepo } from "@ava/db";
import { logger } from "../logger.js";
import type { SalespersonMove } from "./think.types.js";

const log = logger.child({ service: "think-prediction" });

export interface RecordMovePredictionInput {
  sessionId: string;
  interventionId?: string | null;
  tier: string;
  move: SalespersonMove;
}

/**
 * Stamp a pending MoveOutcome reflecting what the salesperson predicts
 * the next state will be. No-op when the move carries no prediction
 * (tactic_id null and no hypothesis).
 */
export async function recordMovePrediction(
  input: RecordMovePredictionInput,
): Promise<void> {
  const { move } = input;
  if (!move.tactic_id) return; // legacy fallback path — nothing to record

  try {
    await MoveOutcomeRepo.recordPrediction({
      sessionId: input.sessionId,
      interventionId: input.interventionId ?? null,
      tacticId: move.tactic_id,
      frictionId: move.attribution_tag.split(":")[0] ?? "unknown",
      attributionTag: move.attribution_tag,
      predictedMood: move.next_state_hypothesis?.mood ?? null,
      predictedTier: move.next_state_hypothesis?.tier ?? input.tier,
      predictedResponse: move.expected_visitor_response,
    });
  } catch (err) {
    log.warn(
      {
        sessionId: input.sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "[prediction] record failed — continuing without prediction stamp",
    );
  }
}

export interface ResolveActuals {
  sessionId: string;
  actualTier?: string | null;
  /** Optional override; if absent we read current mood from VisitorMind. */
  actualMood?: string | null;
}

/**
 * Resolve the most recent pending prediction for a session against the
 * latest observation. Returns the resolved row id if a resolution
 * happened, null otherwise.
 */
export async function resolvePendingForSession(
  resolution: ResolveActuals,
): Promise<{ id: string; accuracy: number | null } | null> {
  try {
    let actualMood = resolution.actualMood ?? null;
    if (actualMood == null) {
      const mind = await VisitorMindRepo.getViewBySession(resolution.sessionId);
      actualMood = mind?.mood ?? null;
    }

    const resolved = await MoveOutcomeRepo.resolveLatestPending({
      sessionId: resolution.sessionId,
      actualMood,
      actualTier: resolution.actualTier ?? null,
      actualResponse: null, // wired in a later refinement; needs widget-side ack
    });
    if (!resolved) return null;
    return { id: resolved.id, accuracy: resolved.accuracy };
  } catch (err) {
    log.warn(
      {
        sessionId: resolution.sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "[prediction] resolve failed — leaving prediction pending",
    );
    return null;
  }
}

/**
 * Mark every pending prediction for a session as abandoned. Call when
 * the session ends so stale predictions don't pollute aggregates.
 */
export async function abandonSessionPredictions(
  sessionId: string,
): Promise<void> {
  try {
    await MoveOutcomeRepo.abandonPendingForSession(sessionId);
  } catch {
    // best-effort
  }
}
