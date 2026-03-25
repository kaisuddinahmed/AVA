"use strict";
// ============================================================================
// AnalyzerRun Repository — onboarding analysis lifecycle
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalyzerRun = createAnalyzerRun;
exports.getAnalyzerRun = getAnalyzerRun;
exports.updateAnalyzerRun = updateAnalyzerRun;
exports.setAnalyzerRunPhase = setAnalyzerRunPhase;
exports.completeAnalyzerRun = completeAnalyzerRun;
exports.failAnalyzerRun = failAnalyzerRun;
exports.listAnalyzerRunsBySite = listAnalyzerRunsBySite;
exports.getLatestAnalyzerRunBySite = getLatestAnalyzerRunBySite;
exports.getAnalyzerRunWithMappings = getAnalyzerRunWithMappings;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createAnalyzerRun(data) {
    const db = client_js_1.prisma;
    return db.analyzerRun.create({ data });
}
async function getAnalyzerRun(id) {
    const db = client_js_1.prisma;
    return db.analyzerRun.findUnique({
        where: { id },
        include: { siteConfig: true },
    });
}
async function updateAnalyzerRun(id, data) {
    const db = client_js_1.prisma;
    return db.analyzerRun.update({
        where: { id },
        data,
    });
}
// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------
async function setAnalyzerRunPhase(id, phase) {
    const db = client_js_1.prisma;
    return db.analyzerRun.update({
        where: { id },
        data: { phase },
    });
}
async function completeAnalyzerRun(id, data) {
    const db = client_js_1.prisma;
    return db.analyzerRun.update({
        where: { id },
        data: {
            status: "completed",
            completedAt: new Date(),
            ...(data?.phase ? { phase: data.phase } : {}),
            ...(data?.behaviorCoverage !== undefined
                ? { behaviorCoverage: data.behaviorCoverage }
                : {}),
            ...(data?.frictionCoverage !== undefined
                ? { frictionCoverage: data.frictionCoverage }
                : {}),
            ...(data?.avgConfidence !== undefined
                ? { avgConfidence: data.avgConfidence }
                : {}),
            ...(data?.summary ? { summary: data.summary } : {}),
        },
    });
}
async function failAnalyzerRun(id, errorMessage) {
    const db = client_js_1.prisma;
    return db.analyzerRun.update({
        where: { id },
        data: {
            status: "failed",
            errorMessage,
            completedAt: new Date(),
        },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listAnalyzerRunsBySite(siteConfigId, limit = 20) {
    const db = client_js_1.prisma;
    return db.analyzerRun.findMany({
        where: { siteConfigId },
        orderBy: { startedAt: "desc" },
        take: limit,
    });
}
async function getLatestAnalyzerRunBySite(siteConfigId) {
    const db = client_js_1.prisma;
    return db.analyzerRun.findFirst({
        where: { siteConfigId },
        orderBy: { startedAt: "desc" },
    });
}
async function getAnalyzerRunWithMappings(id, options) {
    const db = client_js_1.prisma;
    return db.analyzerRun.findUnique({
        where: { id },
        include: {
            siteConfig: true,
            behaviorMappings: {
                orderBy: { confidence: "desc" },
                take: options?.behaviorLimit ?? 100,
            },
            frictionMappings: {
                orderBy: { confidence: "desc" },
                take: options?.frictionLimit ?? 100,
            },
        },
    });
}
//# sourceMappingURL=analyzer-run.repo.js.map