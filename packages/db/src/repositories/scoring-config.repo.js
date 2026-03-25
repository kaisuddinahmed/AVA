"use strict";
// ============================================================================
// ScoringConfig Repository — MSWIM weight profile CRUD
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScoringConfig = createScoringConfig;
exports.getScoringConfig = getScoringConfig;
exports.updateScoringConfig = updateScoringConfig;
exports.deleteScoringConfig = deleteScoringConfig;
exports.getActiveConfig = getActiveConfig;
exports.activateConfig = activateConfig;
exports.listScoringConfigs = listScoringConfigs;
exports.listScoringConfigsBySite = listScoringConfigsBySite;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createScoringConfig(data) {
    return client_js_1.prisma.scoringConfig.create({ data });
}
async function getScoringConfig(id) {
    return client_js_1.prisma.scoringConfig.findUnique({ where: { id } });
}
async function updateScoringConfig(id, data) {
    return client_js_1.prisma.scoringConfig.update({ where: { id }, data });
}
async function deleteScoringConfig(id) {
    return client_js_1.prisma.scoringConfig.delete({ where: { id } });
}
// ---------------------------------------------------------------------------
// Active config resolution
// ---------------------------------------------------------------------------
/**
 * Get the active scoring config for a given site URL.
 * Falls back to global default (siteUrl == null) if no site-specific config.
 */
async function getActiveConfig(siteUrl) {
    // Try site-specific first
    if (siteUrl) {
        const siteConfig = await client_js_1.prisma.scoringConfig.findFirst({
            where: { siteUrl, isActive: true },
        });
        if (siteConfig)
            return siteConfig;
    }
    // Fall back to global default
    return client_js_1.prisma.scoringConfig.findFirst({
        where: { siteUrl: null, isActive: true },
    });
}
/**
 * Set a config as active, deactivating any other active config for the same scope.
 */
async function activateConfig(id) {
    const config = await client_js_1.prisma.scoringConfig.findUnique({ where: { id } });
    if (!config)
        throw new Error(`ScoringConfig ${id} not found`);
    // Deactivate other configs in the same scope
    await client_js_1.prisma.scoringConfig.updateMany({
        where: {
            siteUrl: config.siteUrl,
            isActive: true,
            id: { not: id },
        },
        data: { isActive: false },
    });
    // Activate the target config
    return client_js_1.prisma.scoringConfig.update({
        where: { id },
        data: { isActive: true },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listScoringConfigs() {
    return client_js_1.prisma.scoringConfig.findMany({
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
}
async function listScoringConfigsBySite(siteUrl) {
    return client_js_1.prisma.scoringConfig.findMany({
        where: { OR: [{ siteUrl }, { siteUrl: null }] },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
}
//# sourceMappingURL=scoring-config.repo.js.map