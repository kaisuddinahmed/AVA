// ============================================================================
// ShadowComparison Repository — dual-path evaluation comparison data
// ============================================================================

import { prisma } from "../client.js";

export type CreateShadowComparisonInput = {
  sessionId: string;
  evaluationId: string;

  // Production signals
  prodIntentScore: number;
  prodFrictionScore: number;
  prodClarityScore: number;
  prodReceptivityScore: number;
  prodValueScore: number;
  prodCompositeScore: number;
  prodTier: string;
  prodDecision: string;
  prodGateOverride?: string;

  // Shadow signals
  shadowIntentScore: number;
  shadowFrictionScore: number;
  shadowClarityScore: number;
  shadowReceptivityScore: number;
  shadowValueScore: number;
  shadowCompositeScore: number;
  shadowTier: string;
  shadowDecision: string;
  shadowGateOverride?: string;

  // Divergence
  compositeDivergence: number;
  tierMatch: boolean;
  decisionMatch: boolean;
  gateOverrideMatch: boolean;

  // Context
  pageType: string;
  eventCount: number;
  cartValue: number;

  // Debug
  syntheticHints: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createComparison(data: CreateShadowComparisonInput) {
  return prisma.shadowComparison.create({ data });
}

export async function getComparison(id: string) {
  return prisma.shadowComparison.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getComparisonsBySession(sessionId: string) {
  return prisma.shadowComparison.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listComparisons(options?: {
  limit?: number;
  offset?: number;
  sessionId?: string;
  tierMatch?: boolean;
  decisionMatch?: boolean;
  minDivergence?: number;
}) {
  const where: Record<string, unknown> = {};

  if (options?.sessionId) where.sessionId = options.sessionId;
  if (options?.tierMatch !== undefined) where.tierMatch = options.tierMatch;
  if (options?.decisionMatch !== undefined) where.decisionMatch = options.decisionMatch;
  if (options?.minDivergence !== undefined) {
    where.compositeDivergence = { gte: options.minDivergence };
  }

  return prisma.shadowComparison.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

export async function getStats() {
  const [total, tierMatches, decisionMatches, avgDivergence] =
    await Promise.all([
      prisma.shadowComparison.count(),
      prisma.shadowComparison.count({ where: { tierMatch: true } }),
      prisma.shadowComparison.count({ where: { decisionMatch: true } }),
      prisma.shadowComparison.aggregate({
        _avg: { compositeDivergence: true },
      }),
    ]);

  return {
    totalComparisons: total,
    tierAgreementRate: total > 0 ? tierMatches / total : 0,
    decisionAgreementRate: total > 0 ? decisionMatches / total : 0,
    avgCompositeDivergence: avgDivergence._avg.compositeDivergence ?? 0,
    tierMatches,
    tierMismatches: total - tierMatches,
    decisionMatches,
    decisionMismatches: total - decisionMatches,
  };
}

/**
 * Windowed shadow-comparison aggregates used by the drift detector.
 * Returns raw counts + avg divergence so the caller can compute rates.
 */
export async function getDriftAggregatesSince(since: Date): Promise<{
  total: number;
  tierMatches: number;
  decisionMatches: number;
  avgCompositeDivergence: number;
}> {
  const where = { createdAt: { gte: since } };
  const [total, tierMatches, decisionMatches, avgDivergence] =
    await Promise.all([
      prisma.shadowComparison.count({ where }),
      prisma.shadowComparison.count({ where: { ...where, tierMatch: true } }),
      prisma.shadowComparison.count({ where: { ...where, decisionMatch: true } }),
      prisma.shadowComparison.aggregate({ where, _avg: { compositeDivergence: true } }),
    ]);
  return {
    total,
    tierMatches,
    decisionMatches,
    avgCompositeDivergence: avgDivergence._avg.compositeDivergence ?? 0,
  };
}

export async function getTopDivergences(limit: number = 20) {
  return prisma.shadowComparison.findMany({
    where: { decisionMatch: false },
    orderBy: { compositeDivergence: "desc" },
    take: limit,
  });
}

export async function getDivergenceDistribution() {
  const results = await prisma.shadowComparison.groupBy({
    by: ["tierMatch", "decisionMatch"],
    _count: { id: true },
    _avg: { compositeDivergence: true },
  });

  return results.map((r) => ({
    tierMatch: r.tierMatch,
    decisionMatch: r.decisionMatch,
    count: r._count.id,
    avgDivergence: r._avg.compositeDivergence,
  }));
}
