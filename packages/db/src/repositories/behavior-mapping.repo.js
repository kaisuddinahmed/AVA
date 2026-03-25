"use strict";
// ============================================================================
// BehaviorPatternMapping Repository — B001-B614 site mapping records
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBehaviorMapping = createBehaviorMapping;
exports.createBehaviorMappings = createBehaviorMappings;
exports.getBehaviorMapping = getBehaviorMapping;
exports.updateBehaviorMapping = updateBehaviorMapping;
exports.listBehaviorMappingsByRun = listBehaviorMappingsByRun;
exports.listBehaviorMappingsBySite = listBehaviorMappingsBySite;
exports.listLowConfidenceBehaviorMappings = listLowConfidenceBehaviorMappings;
exports.countBehaviorMappings = countBehaviorMappings;
exports.countDistinctBehaviorPatterns = countDistinctBehaviorPatterns;
exports.countHighConfidenceBehaviors = countHighConfidenceBehaviors;
exports.deleteBehaviorMappingsBySite = deleteBehaviorMappingsBySite;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createBehaviorMapping(data) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.create({ data });
}
async function createBehaviorMappings(data) {
    if (data.length === 0)
        return { count: 0 };
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.createMany({ data });
}
async function getBehaviorMapping(id) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.findUnique({ where: { id } });
}
async function updateBehaviorMapping(id, data) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.update({ where: { id }, data });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listBehaviorMappingsByRun(analyzerRunId, limit = 200) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.findMany({
        where: { analyzerRunId },
        orderBy: [{ confidence: "desc" }, { patternId: "asc" }],
        take: limit,
    });
}
async function listBehaviorMappingsBySite(siteConfigId, limit = 200) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.findMany({
        where: { siteConfigId },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
    });
}
async function listLowConfidenceBehaviorMappings(siteConfigId, threshold = 0.75, limit = 200) {
    const db = client_js_1.prisma;
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
async function countBehaviorMappings(siteConfigId, analyzerRunId) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
        },
    });
}
async function countDistinctBehaviorPatterns(siteConfigId, analyzerRunId) {
    const db = client_js_1.prisma;
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
async function countHighConfidenceBehaviors(siteConfigId, analyzerRunId, threshold = 0.75) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.count({
        where: {
            siteConfigId,
            ...(analyzerRunId ? { analyzerRunId } : {}),
            confidence: { gte: threshold },
        },
    });
}
async function deleteBehaviorMappingsBySite(siteConfigId) {
    const db = client_js_1.prisma;
    return db.behaviorPatternMapping.deleteMany({
        where: { siteConfigId },
    });
}
//# sourceMappingURL=behavior-mapping.repo.js.map