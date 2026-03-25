// ============================================================================
// ModelVersion Repository — fine-tuned model lifecycle management
// ============================================================================

import { prisma } from "../client.js";

export type CreateModelVersionInput = {
  provider: string;
  baseModel: string;
  modelId: string;
  fineTuneJobId?: string;
  status?: string;
  trainingDatapointCount?: number;
  qualityStats?: string;
};

export async function createModelVersion(data: CreateModelVersionInput) {
  return prisma.modelVersion.create({ data });
}

export async function getModelVersion(id: string) {
  return prisma.modelVersion.findUnique({ where: { id } });
}

export async function getActiveModel(provider: string) {
  return prisma.modelVersion.findFirst({
    where: { provider, status: "active" },
    orderBy: { promotedAt: "desc" },
  });
}

/**
 * Promote a model version to active. Retires any currently active model
 * for the same provider first. Only one active per provider at a time.
 */
export async function promoteModel(id: string) {
  const target = await prisma.modelVersion.findUnique({ where: { id } });
  if (!target) throw new Error(`ModelVersion ${id} not found`);

  // Retire current active for this provider
  const current = await getActiveModel(target.provider);
  if (current && current.id !== id) {
    await prisma.modelVersion.update({
      where: { id: current.id },
      data: { status: "retired", retiredAt: new Date() },
    });
  }

  return prisma.modelVersion.update({
    where: { id },
    data: { status: "active", promotedAt: new Date() },
  });
}

export async function retireModel(id: string) {
  return prisma.modelVersion.update({
    where: { id },
    data: { status: "retired", retiredAt: new Date() },
  });
}

export async function updateModelVersion(
  id: string,
  data: Partial<{
    status: string;
    fineTuneJobId: string;
    modelId: string;
    evalMetrics: string;
    qualityStats: string;
  }>,
) {
  return prisma.modelVersion.update({ where: { id }, data });
}

export async function listModelVersions(options?: {
  provider?: string;
  status?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (options?.provider) where.provider = options.provider;
  if (options?.status) where.status = options.status;

  return prisma.modelVersion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}
