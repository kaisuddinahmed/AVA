"use strict";
// ============================================================================
// IntegrationStatus Repository — onboarding progress + activation state log
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIntegrationStatus = createIntegrationStatus;
exports.getIntegrationStatus = getIntegrationStatus;
exports.updateIntegrationStatus = updateIntegrationStatus;
exports.listIntegrationStatusesBySite = listIntegrationStatusesBySite;
exports.getLatestIntegrationStatusBySite = getLatestIntegrationStatusBySite;
exports.getLatestIntegrationStatusByRun = getLatestIntegrationStatusByRun;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createIntegrationStatus(data) {
    const db = client_js_1.prisma;
    return db.integrationStatus.create({ data });
}
async function getIntegrationStatus(id) {
    const db = client_js_1.prisma;
    return db.integrationStatus.findUnique({ where: { id } });
}
async function updateIntegrationStatus(id, data) {
    const db = client_js_1.prisma;
    return db.integrationStatus.update({
        where: { id },
        data,
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listIntegrationStatusesBySite(siteConfigId, limit = 50) {
    const db = client_js_1.prisma;
    return db.integrationStatus.findMany({
        where: { siteConfigId },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
async function getLatestIntegrationStatusBySite(siteConfigId) {
    const db = client_js_1.prisma;
    return db.integrationStatus.findFirst({
        where: { siteConfigId },
        orderBy: { createdAt: "desc" },
    });
}
async function getLatestIntegrationStatusByRun(analyzerRunId) {
    const db = client_js_1.prisma;
    return db.integrationStatus.findFirst({
        where: { analyzerRunId },
        orderBy: { createdAt: "desc" },
    });
}
//# sourceMappingURL=integration-status.repo.js.map