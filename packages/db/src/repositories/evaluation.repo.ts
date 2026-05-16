// ============================================================================
// Evaluation Repository — LLM evaluation results with MSWIM scores
// ============================================================================

import { prisma } from "../client.js";

export type CreateEvaluationInput = {
  sessionId: string;
  eventBatchIds: string; // JSON array

  // LLM output
  narrative: string;
  frictionsFound: string; // JSON array

  // MSWIM signals
  intentScore: number;
  frictionScore: number;
  clarityScore: number;
  receptivityScore: number;
  valueScore: number;

  // MSWIM composite + decision
  compositeScore: number;
  weightsUsed: string; // JSON
  tier: string;
  decision: string;
  gateOverride?: string;
  interventionType?: string;
  reasoning: string;

  // Detected behavior patterns (JSON: DetectedBehaviorPattern[])
  detectedBehaviors?: string;

  // Predictive abandonment score (0–100)
  abandonmentScore?: number;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createEvaluation(data: CreateEvaluationInput) {
  return prisma.evaluation.create({ data });
}

export async function getEvaluation(id: string) {
  return prisma.evaluation.findUnique({
    where: { id },
    include: { intervention: true },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getEvaluationsBySession(sessionId: string) {
  return prisma.evaluation.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    include: { intervention: true },
  });
}

export async function getLatestEvaluation(sessionId: string) {
  return prisma.evaluation.findFirst({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    include: { intervention: true },
  });
}

/**
 * Latest evaluation whose intervention is NOT a synthetic voice-response
 * row. Used by the voice/agent prompt builders (Phase 2.2) to pick the real
 * behavioral/MSWIM tier instead of self-shadowing on AVA's own VOICE_REPLY /
 * AGENT_VOICE rows.
 *
 * Codex Phase 2.2 review (P1): `getLatestEvaluation` would return the most
 * recent eval — including the one this voice path just wrote at hardcoded
 * NUDGE — so an ESCALATE friction would silently downgrade to NUDGE on the
 * next turn, breaking cart-recovery posture.
 */
export async function getLatestNonVoiceEvaluation(sessionId: string) {
  return prisma.evaluation.findFirst({
    where: {
      sessionId,
      OR: [
        { intervention: null },
        { intervention: { actionCode: { notIn: ["VOICE_REPLY", "AGENT_VOICE"] } } },
      ],
    },
    orderBy: { timestamp: "desc" },
    include: { intervention: true },
  });
}

export async function getEvaluationsByTier(tier: string, limit = 20) {
  return prisma.evaluation.findMany({
    where: { tier },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function getEvaluationsBySite(siteUrl: string, limit = 50) {
  return prisma.evaluation.findMany({
    where: { session: { siteUrl } },
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { session: { select: { siteUrl: true, visitorId: true } } },
  });
}

/**
 * List all evaluations with optional limit and time filter (for analytics).
 */
export async function listEvaluations(options?: { limit?: number; since?: Date; siteUrl?: string }) {
  const where: Record<string, unknown> = {};
  if (options?.since) where.timestamp = { gte: options.since };
  if (options?.siteUrl) where.session = { siteUrl: options.siteUrl };

  return prisma.evaluation.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: options?.limit ?? 100,
  });
}

/**
 * Get all evaluated event IDs for a session (to avoid re-evaluating).
 */
/**
 * Average MSWIM signals for evaluations whose linked intervention reached the
 * given outcome status within the window. Used by the drift detector to
 * compute per-outcome signal calibration.
 *
 * `signalCalibration` callers should use this twice — once with "converted",
 * once with "dismissed" — and diff the means.
 */
export async function getAvgSignalsByOutcome(
  since: Date,
  outcome: "converted" | "dismissed" | "ignored",
): Promise<{
  intentScore: number | null;
  frictionScore: number | null;
  clarityScore: number | null;
  receptivityScore: number | null;
  valueScore: number | null;
  compositeScore: number | null;
}> {
  const agg = await prisma.evaluation.aggregate({
    where: {
      timestamp: { gte: since },
      intervention: { status: outcome },
    },
    _avg: {
      intentScore: true,
      frictionScore: true,
      clarityScore: true,
      receptivityScore: true,
      valueScore: true,
      compositeScore: true,
    },
  });
  return agg._avg;
}

/**
 * Distinct session IDs that hit an abandonment score >= threshold since `since`.
 * Used by the nightly batch to compute abandonment-prediction accuracy.
 */
export async function listHighAbandonmentSessionIds(
  since: Date,
  threshold: number,
): Promise<string[]> {
  const rows = await prisma.evaluation.findMany({
    where: {
      timestamp: { gte: since },
      abandonmentScore: { gte: threshold },
    },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  return rows.map((r) => r.sessionId);
}

export async function getEvaluatedEventIds(
  sessionId: string
): Promise<string[]> {
  const evals = await prisma.evaluation.findMany({
    where: { sessionId },
    select: { eventBatchIds: true },
  });
  const ids: string[] = [];
  for (const e of evals) {
    try {
      const batch = JSON.parse(e.eventBatchIds) as string[];
      ids.push(...batch);
    } catch {
      // skip malformed
    }
  }
  return ids;
}
