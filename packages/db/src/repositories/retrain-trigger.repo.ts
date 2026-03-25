// ============================================================================
// RetrainTrigger Repository — automated retraining decision tracking
// ============================================================================

import { prisma } from "../client.js";

export async function createTrigger(data: {
  reason: string;
  trainingDatapointCount: number;
  status?: string;
}) {
  return prisma.retrainTrigger.create({ data });
}

export async function updateTrigger(
  id: string,
  data: Partial<{
    modelVersionId: string;
    status: string;
    completedAt: Date;
    error: string;
  }>,
) {
  return prisma.retrainTrigger.update({ where: { id }, data });
}

export async function getLastTrigger() {
  return prisma.retrainTrigger.findFirst({
    orderBy: { triggeredAt: "desc" },
  });
}

export async function listTriggers(options?: { limit?: number; offset?: number }) {
  return prisma.retrainTrigger.findMany({
    orderBy: { triggeredAt: "desc" },
    take: options?.limit ?? 20,
    skip: options?.offset ?? 0,
  });
}

export async function getActiveTrigger() {
  return prisma.retrainTrigger.findFirst({
    where: {
      status: { notIn: ["completed", "failed"] },
    },
    orderBy: { triggeredAt: "desc" },
  });
}
