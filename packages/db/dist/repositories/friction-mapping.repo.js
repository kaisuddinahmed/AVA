// ============================================================================
// FrictionMapping Repository — F001-F325 site detector mapping records
// ============================================================================
import { prisma } from "../client.js";
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createFrictionMapping(data) {
    const db = prisma;
    return db.frictionMapping.create({ data });
}
export async function createFrictionMappings(data) {
    if (data.length === 0)
        return { count: 0 };
    const db = prisma;
    return db.frictionMapping.createMany({ data });
}
export async function getFrictionMapping(id) {
    const db = prisma;
    return db.frictionMapping.findUnique({ where: { id } });
}
export async function updateFrictionMapping(id, data) {
    const db = prisma;
    return db.frictionMapping.update({ where: { id }, data });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function listFrictionMappingsByRun(analyzerRunId, limit = 200) {
    const db = prisma;
    return db.frictionMapping.findMany({
        where: { analyzerRunId },
        orderBy: [{ confidence: "desc" }, { frictionId: "asc" }],
        take: limit,
    });
}
export async function listFrictionMappingsBySite(siteConfigId, limit = 200) {
    const db = prisma;
    return db.frictionMapping.findMany({
        where: { siteConfigId },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
    });
}
export async function listLowConfidenceFrictionMappings(siteConfigId, threshold = 0.75, limit = 200) {
    const db = prisma;
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
export async function countFrictionMappings(siteConfigId, analyzerRunId) {
    const db = prisma;
    return db.frictionMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
        },
    });
}
export async function countDistinctFrictions(siteConfigId, analyzerRunId) {
    const db = prisma;
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
export async function countHighConfidenceFrictions(siteConfigId, analyzerRunId, threshold = 0.75) {
    const db = prisma;
    return db.frictionMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
            confidence: { gte: threshold },
        },
    });
}
export async function deleteFrictionMappingsBySite(siteConfigId) {
    const db = prisma;
    return db.frictionMapping.deleteMany({ where: { siteConfigId } });
}
//# sourceMappingURL=friction-mapping.repo.js.map