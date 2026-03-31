// ============================================================================
// FrictionMapping Repository — F001-F325 site detector mapping records
// ============================================================================

import { prisma } from "../client.js";

export type CreateFrictionMappingInput = {
  analyzerRunId: string;
  siteConfigId: string;
  frictionId: string;
  detectorType: string;
  triggerEvent: string;
  selector?: string;
  thresholdConfig?: string;
  confidence: number;
  evidence?: string;
  isVerified?: boolean;
  isActive?: boolean;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createFrictionMapping(data: CreateFrictionMappingInput) {
  const db = prisma as any;
  return db.frictionMapping.create({ data });
}

export async function createFrictionMappings(data: CreateFrictionMappingInput[]) {
  if (data.length === 0) return { count: 0 };
  const db = prisma as any;
  return db.frictionMapping.createMany({ data });
}

export async function getFrictionMapping(id: string) {
  const db = prisma as any;
  return db.frictionMapping.findUnique({ where: { id } });
}

export async function updateFrictionMapping(
  id: string,
  data: Partial<{
    detectorType: string;
    triggerEvent: string;
    selector: string | null;
    thresholdConfig: string | null;
    confidence: number;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
  }>,
) {
  const db = prisma as any;
  return db.frictionMapping.update({ where: { id }, data });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listFrictionMappingsByRun(
  analyzerRunId: string,
  limit = 200,
) {
  const db = prisma as any;
  return db.frictionMapping.findMany({
    where: { analyzerRunId },
    orderBy: [{ confidence: "desc" }, { frictionId: "asc" }],
    take: limit,
  });
}

export async function listFrictionMappingsBySite(siteConfigId: string, limit = 200) {
  const db = prisma as any;
  return db.frictionMapping.findMany({
    where: { siteConfigId },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}

export async function listLowConfidenceFrictionMappings(
  siteConfigId: string,
  threshold = 0.75,
  limit = 200,
) {
  const db = prisma as any;
  return db.frictionMapping.findMany({
    where: {
      siteConfigId,
      confidence: { lt: threshold },
      isActive: true,
    },
    orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function countFrictionMappings(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const db = prisma as any;
  return db.frictionMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
  });
}

export async function countDistinctFrictions(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const db = prisma as any;
  const rows = await db.frictionMapping.findMany({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
    select: { frictionId: true },
    distinct: ["frictionId"],
  });
  return rows.length;
}

export async function countHighConfidenceFrictions(
  siteConfigId: string,
  analyzerRunId?: string,
  threshold = 0.75,
) {
  const db = prisma as any;
  return db.frictionMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
      confidence: { gte: threshold },
    },
  });
}

export async function deleteFrictionMappingsBySite(siteConfigId: string) {
  const db = prisma as any;
  return db.frictionMapping.deleteMany({ where: { siteConfigId } });
}
