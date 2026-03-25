// ============================================================================
// BehaviorPatternMapping Repository — B001-B614 site mapping records
// ============================================================================
import { prisma } from "../client.js";
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createBehaviorMapping(data) {
    const db = prisma;
    return db.behaviorPatternMapping.create({ data });
}
export async function createBehaviorMappings(data) {
    if (data.length === 0)
        return { count: 0 };
    // createMany crashes in Prisma WASM — loop single creates instead
    const db = prisma;
    for (const row of data) {
        await db.behaviorPatternMapping.create({ data: row });
    }
    return { count: data.length };
}
export async function getBehaviorMapping(id) {
    const db = prisma;
    return db.behaviorPatternMapping.findUnique({ where: { id } });
}
export async function updateBehaviorMapping(id, data) {
    const db = prisma;
    return db.behaviorPatternMapping.update({ where: { id }, data });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function listBehaviorMappingsByRun(analyzerRunId, limit = 200) {
    const db = prisma;
    return db.behaviorPatternMapping.findMany({
        where: { analyzerRunId },
        orderBy: [{ confidence: "desc" }, { patternId: "asc" }],
        take: limit,
    });
}
export async function listBehaviorMappingsBySite(siteConfigId, limit = 200) {
    const db = prisma;
    return db.behaviorPatternMapping.findMany({
        where: { siteConfigId },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
    });
}
export async function listLowConfidenceBehaviorMappings(siteConfigId, threshold = 0.75, limit = 200) {
    const db = prisma;
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
export async function countBehaviorMappings(siteConfigId, analyzerRunId) {
    const db = prisma;
    return db.behaviorPatternMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
        },
    });
}
export async function countDistinctBehaviorPatterns(siteConfigId, analyzerRunId) {
    const db = prisma;
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
export async function countHighConfidenceBehaviors(siteConfigId, analyzerRunId, threshold = 0.75) {
    const db = prisma;
    return db.behaviorPatternMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
            confidence: { gte: threshold },
        },
    });
}
export async function deleteBehaviorMappingsBySite(siteConfigId) {
    const db = prisma;
    return db.behaviorPatternMapping.deleteMany({
        where: { siteConfigId },
    });
}
//# sourceMappingURL=behavior-mapping.repo.js.map