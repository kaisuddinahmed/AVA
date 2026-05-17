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

/**
 * List recommendations for a site filtered by status.
 *
 * Codex P2 #3 — supports a `statuses` array so callers can scope to multiple
 * statuses (e.g. ["approved", "active"] for the live-results summary).
 * Without this, the latest-50-by-createdAt window would drop older approved
 * rows whenever a flood of newer pending/rejected rows existed.
 */
export async function listBySite(siteUrl: string, options?: {
  status?: string;
  statuses?: string[];
  limit?: number;
}) {
  const statusFilter = options?.statuses && options.statuses.length > 0
    ? { status: { in: options.statuses } }
    : options?.status
    ? { status: options.status }
    : {};
  return prisma.recommendation.findMany({
    where: {
      siteUrl,
      ...statusFilter,
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

/**
 * Atomic approve — Codex P1 #2. Conditional update guarded by `status=pending`.
 * Returns `{ count: 0 | 1 }`: 1 means this caller won the claim, 0 means
 * another caller already moved the row out of `pending` (race condition).
 * The service layer uses count===0 to detect duplicate-approve races and
 * clean up the orphaned experiment it just created.
 */
export async function approveIfPending(id: string, experimentId: string) {
  return prisma.recommendation.updateMany({
    where: { id, status: "pending" },
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
