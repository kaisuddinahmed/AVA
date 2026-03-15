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
