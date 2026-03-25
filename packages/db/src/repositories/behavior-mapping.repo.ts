// ============================================================================
// BehaviorPatternMapping Repository — B001-B614 site mapping records
// ============================================================================

import { prisma } from "../client.js";

export type CreateBehaviorMappingInput = {
  analyzerRunId: string;
  siteConfigId: string;
  patternId: string;
  patternName: string;
  mappedFunction: string;
  eventType: string;
  selector?: string;
  confidence: number;
  source: string;
  evidence?: string;
  isVerified?: boolean;
  isActive?: boolean;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createBehaviorMapping(data: CreateBehaviorMappingInput) {
  const db = prisma as any;
  return db.behaviorPatternMapping.create({ data });
}

export async function createBehaviorMappings(
  data: CreateBehaviorMappingInput[],
) {
  if (data.length === 0) return { count: 0 };
  // createMany crashes in Prisma WASM — loop single creates instead
  const db = prisma as any;
  for (const row of data) { await db.behaviorPatternMapping.create({ data: row }); }
  return { count: data.length };
}

export async function getBehaviorMapping(id: string) {
  const db = prisma as any;
  return db.behaviorPatternMapping.findUnique({ where: { id } });
}

export async function updateBehaviorMapping(
  id: string,
  data: Partial<{
    mappedFunction: string;
    eventType: string;
    selector: string | null;
    confidence: number;
    source: string;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
  }>,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.update({ where: { id }, data });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBehaviorMappingsByRun(
  analyzerRunId: string,
  limit = 200,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.findMany({
    where: { analyzerRunId },
    orderBy: [{ confidence: "desc" }, { patternId: "asc" }],
    take: limit,
  });
}

export async function listBehaviorMappingsBySite(
  siteConfigId: string,
  limit = 200,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.findMany({
    where: { siteConfigId },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}

export async function listLowConfidenceBehaviorMappings(
  siteConfigId: string,
  threshold = 0.75,
  limit = 200,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.findMany({
    where: {
      siteConfigId,
      confidence: { lt: threshold },
      isActive: true,
    },
    orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function countBehaviorMappings(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
  });
}

export async function countDistinctBehaviorPatterns(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const db = prisma as any;
  const rows = await db.behaviorPatternMapping.findMany({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
    select: { patternId: true },
    distinct: ["patternId"],
  });
  return rows.length;
}

export async function countHighConfidenceBehaviors(
  siteConfigId: string,
  analyzerRunId?: string,
  threshold = 0.75,
) {
  const db = prisma as any;
  return db.behaviorPatternMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
      confidence: { gte: threshold },
    },
  });
}

export async function deleteBehaviorMappingsBySite(siteConfigId: string) {
  const db = prisma as any;
  return db.behaviorPatternMapping.deleteMany({
    where: { siteConfigId },
  });
}
