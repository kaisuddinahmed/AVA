// ============================================================================
// TrainingDatapoint Repository — denormalized training data for LLM fine-tuning
// ============================================================================

import { prisma } from "../client.js";

export type CreateTrainingDatapointInput = {
  sessionId: string;
  evaluationId: string;
  interventionId: string;

  // Session context
  siteUrl: string;
  deviceType: string;
  referrerType: string;
  isLoggedIn: boolean;
  isRepeatVisitor: boolean;
  cartValue: number;
  cartItemCount: number;
  sessionAgeSec: number;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalConversions: number;

  // LLM input
  eventBatchIds: string;
  rawEventData: string;
  pageType: string;

  // LLM output
  narrative: string;
  frictionsFound: string;

  // MSWIM scores
  intentScore: number;
  frictionScore: number;
  clarityScore: number;
  receptivityScore: number;
  valueScore: number;
  compositeScore: number;
  weightsUsed: string;
  tier: string;
  decision: string;
  gateOverride?: string;

  // Intervention
  interventionType: string;
  actionCode: string;
  frictionId: string;
  mswimScoreAtFire: number;
  tierAtFire: string;

  // Outcome
  outcome: string;
  conversionAction?: string;
  outcomeDelayMs?: number;

  // Quality
  qualityFlags?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createDatapoint(data: CreateTrainingDatapointInput) {
  return prisma.trainingDatapoint.create({ data });
}

export async function getDatapoint(id: string) {
  return prisma.trainingDatapoint.findUnique({ where: { id } });
}

export async function getDatapointByInterventionId(interventionId: string) {
  return prisma.trainingDatapoint.findUnique({ where: { interventionId } });
}

// ---------------------------------------------------------------------------
// Queries for export
// ---------------------------------------------------------------------------

export async function listDatapoints(options?: {
  limit?: number;
  offset?: number;
  outcome?: string;
  tier?: string;
  siteUrl?: string;
  frictionId?: string;
  interventionType?: string;
  since?: Date;
  until?: Date;
}) {
  const where: Record<string, unknown> = {};

  if (options?.outcome) where.outcome = options.outcome;
  if (options?.tier) where.tier = options.tier;
  if (options?.siteUrl) where.siteUrl = options.siteUrl;
  if (options?.frictionId) where.frictionId = options.frictionId;
  if (options?.interventionType) where.interventionType = options.interventionType;

  if (options?.since || options?.until) {
    const dateFilter: Record<string, Date> = {};
    if (options?.since) dateFilter.gte = options.since;
    if (options?.until) dateFilter.lte = options.until;
    where.createdAt = dateFilter;
  }

  return prisma.trainingDatapoint.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
    skip: options?.offset ?? 0,
  });
}

export async function countDatapoints(options?: {
  outcome?: string;
  tier?: string;
  siteUrl?: string;
}) {
  const where: Record<string, unknown> = {};
  if (options?.outcome) where.outcome = options.outcome;
  if (options?.tier) where.tier = options.tier;
  if (options?.siteUrl) where.siteUrl = options.siteUrl;

  return prisma.trainingDatapoint.count({ where });
}

/**
 * Get outcome distribution for diagnostics.
 */
export async function getOutcomeDistribution(siteUrl?: string) {
  const where = siteUrl ? { siteUrl } : {};
  const results = await prisma.trainingDatapoint.groupBy({
    by: ["outcome"],
    where,
    _count: { id: true },
  });

  return results.map((r) => ({
    outcome: r.outcome,
    count: r._count.id,
  }));
}

/**
 * Update user feedback on a training datapoint (enrichment from InterventionFeedback).
 */
export async function updateUserFeedback(interventionId: string, feedback: string) {
  return prisma.trainingDatapoint.update({
    where: { interventionId },
    data: { userFeedback: feedback },
  });
}

/**
 * Get tier × outcome cross-tabulation for model analysis.
 */
export async function getTierOutcomeCrossTab(siteUrl?: string) {
  const where = siteUrl ? { siteUrl } : {};
  const results = await prisma.trainingDatapoint.groupBy({
    by: ["tier", "outcome"],
    where,
    _count: { id: true },
    _avg: { compositeScore: true },
  });

  return results.map((r) => ({
    tier: r.tier,
    outcome: r.outcome,
    count: r._count.id,
    avgCompositeScore: r._avg.compositeScore,
  }));
}
