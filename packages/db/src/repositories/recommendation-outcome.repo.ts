// ============================================================================
// RecommendationOutcome Repository — A/B result snapshots per Recommendation
// Phase 3 — Intelligent Dashboard / Action Engine.
//
// Feeds the weekly digest and revenue-attribution cards.
// ============================================================================

import { prisma } from "../client.js";

export type CreateOutcomeInput = {
  recommendationId: string;
  experimentId: string;
  windowStart: Date;
  windowEnd: Date;
  variantSessions: number;
  controlSessions: number;
  variantConversions: number;
  controlConversions: number;
  conversionDeltaPct: number;
  attributedRevenue?: number;
  pValue?: number | null;
  decision?: string | null;     // ship | rollback | extend | inconclusive
};

export async function createOutcome(data: CreateOutcomeInput) {
  return prisma.recommendationOutcome.create({
    data: {
      ...data,
      attributedRevenue: data.attributedRevenue ?? 0,
      decidedAt: data.decision ? new Date() : null,
    },
  });
}

export async function listByRecommendation(recommendationId: string) {
  return prisma.recommendationOutcome.findMany({
    where: { recommendationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listByExperiment(experimentId: string) {
  return prisma.recommendationOutcome.findMany({
    where: { experimentId },
    orderBy: { windowEnd: "desc" },
  });
}

/** List all decisions of a given kind across the system (e.g., shipped wins). */
export async function listByDecision(decision: string, options?: { limit?: number }) {
  return prisma.recommendationOutcome.findMany({
    where: { decision },
    orderBy: { decidedAt: "desc" },
    take: options?.limit ?? 50,
  });
}

/** Recent outcomes (for weekly digest). */
export async function listRecent(options?: { limit?: number; since?: Date }) {
  return prisma.recommendationOutcome.findMany({
    where: options?.since ? { createdAt: { gte: options.since } } : {},
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}
