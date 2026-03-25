"use strict";
// ============================================================================
// FrictionMapping Repository — F001-F325 site detector mapping records
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFrictionMapping = createFrictionMapping;
exports.createFrictionMappings = createFrictionMappings;
exports.getFrictionMapping = getFrictionMapping;
exports.updateFrictionMapping = updateFrictionMapping;
exports.listFrictionMappingsByRun = listFrictionMappingsByRun;
exports.listFrictionMappingsBySite = listFrictionMappingsBySite;
exports.listLowConfidenceFrictionMappings = listLowConfidenceFrictionMappings;
exports.countFrictionMappings = countFrictionMappings;
exports.countDistinctFrictions = countDistinctFrictions;
exports.countHighConfidenceFrictions = countHighConfidenceFrictions;
exports.deleteFrictionMappingsBySite = deleteFrictionMappingsBySite;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createFrictionMapping(data) {
    const db = client_js_1.prisma;
    return db.frictionMapping.create({ data });
}
async function createFrictionMappings(data) {
    if (data.length === 0)
        return { count: 0 };
    const db = client_js_1.prisma;
    return db.frictionMapping.createMany({ data });
}
async function getFrictionMapping(id) {
    const db = client_js_1.prisma;
    return db.frictionMapping.findUnique({ where: { id } });
}
async function updateFrictionMapping(id, data) {
    const db = client_js_1.prisma;
    return db.frictionMapping.update({ where: { id }, data });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listFrictionMappingsByRun(analyzerRunId, limit = 200) {
    const db = client_js_1.prisma;
    return db.frictionMapping.findMany({
        where: { analyzerRunId },
        orderBy: [{ confidence: "desc" }, { frictionId: "asc" }],
        take: limit,
    });
}
async function listFrictionMappingsBySite(siteConfigId, limit = 200) {
    const db = client_js_1.prisma;
    return db.frictionMapping.findMany({
        where: { siteConfigId },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
    });
}
async function listLowConfidenceFrictionMappings(siteConfigId, threshold = 0.75, limit = 200) {
    const db = client_js_1.prisma;
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
async function countFrictionMappings(siteConfigId, analyzerRunId) {
    const db = client_js_1.prisma;
    return db.frictionMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
        },
    });
}
async function countDistinctFrictions(siteConfigId, analyzerRunId) {
    const db = client_js_1.prisma;
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
async function countHighConfidenceFrictions(siteConfigId, analyzerRunId, threshold = 0.75) {
    const db = client_js_1.prisma;
    return db.frictionMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
            confidence: { gte: threshold },
        },
    });
}
async function deleteFrictionMappingsBySite(siteConfigId) {
    const db = client_js_1.prisma;
    return db.frictionMapping.deleteMany({
        where: { siteConfigId },
    });
}
//# sourceMappingURL=friction-mapping.repo.js.map