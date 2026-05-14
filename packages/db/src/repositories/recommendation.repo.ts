// ============================================================================
// Recommendation Repository — engine-emitted intervention proposals
// Phase 3 — Intelligent Dashboard / Action Engine.
//
// Lifecycle: pending → (merchant reviews) → approved | rejected
//                                       → active (once linked Experiment runs)
//                                       → archived
// ============================================================================

import { prisma } from "../client.js";

export type CreateRecommendationInput = {
  siteUrl: string;
  frictionId: string;
  interventionType: string;     // passive | nudge | active | escalate
  actionCode: string;
  payloadTemplate: string;      // JSON
  rationale: string;
  expectedLiftPct: number;
  confidence: number;           // 0..1
  sampleSizeBasis: number;
};

export async function createRecommendation(data: CreateRecommendationInput) {
  return prisma.recommendation.create({ data });
}

export async function getRecommendation(id: string) {
  return prisma.recommendation.findUnique({
    where: { id },
    include: { outcomes: true },
  });
}

/** List recommendations for a site filtered by status. */
export async function listBySite(siteUrl: string, options?: {
  status?: string;
  limit?: number;
}) {
  return prisma.recommendation.findMany({
    where: {
      siteUrl,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}

/** List all pending recommendations across sites — used by the dashboard. */
export async function listPending(options?: { limit?: number }) {
  return prisma.recommendation.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}

/** Approve a recommendation and link it to an Experiment. */
export async function approve(id: string, experimentId: string) {
  return prisma.recommendation.update({
    where: { id },
    data: {
      status: "approved",
      approvedExperimentId: experimentId,
      approvedAt: new Date(),
    },
  });
}

/** Reject a recommendation with a reason (for merchant feedback loop). */
export async function reject(id: string, reason: string) {
  return prisma.recommendation.update({
    where: { id },
    data: { status: "rejected", rejectedReason: reason, rejectedAt: new Date() },
  });
}

/** Transition approved → active once the experiment goes live. */
export async function markActive(id: string) {
  return prisma.recommendation.update({
    where: { id },
    data: { status: "active" },
  });
}

/** Archive — terminal state after experiment concludes. */
export async function archive(id: string) {
  return prisma.recommendation.update({
    where: { id },
    data: { status: "archived" },
  });
}
