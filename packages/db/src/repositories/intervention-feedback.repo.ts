// ============================================================================
// InterventionFeedback Repository — user thumbs up/down on interventions
// ============================================================================

import { prisma } from "../client.js";

export async function createFeedback(data: {
  interventionId: string;
  sessionId: string;
  feedback: string;
}) {
  return prisma.interventionFeedback.create({ data });
}

export async function getFeedbackByIntervention(interventionId: string) {
  return prisma.interventionFeedback.findFirst({
    where: { interventionId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFeedbackStats(options?: {
  since?: Date;
}) {
  const where: Record<string, unknown> = {};
  if (options?.since) {
    where.createdAt = { gte: options.since };
  }

  const results = await prisma.interventionFeedback.groupBy({
    by: ["feedback"],
    where,
    _count: { id: true },
  });

  return results.map((r) => ({
    feedback: r.feedback,
    count: r._count.id,
  }));
}
