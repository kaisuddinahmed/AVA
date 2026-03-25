"use strict";
// ============================================================================
// Experiment Repository — A/B test definitions + session assignments
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExperiment = createExperiment;
exports.getExperiment = getExperiment;
exports.updateExperiment = updateExperiment;
exports.startExperiment = startExperiment;
exports.endExperiment = endExperiment;
exports.listExperiments = listExperiments;
exports.getActiveExperiment = getActiveExperiment;
exports.assignSession = assignSession;
exports.getSessionAssignment = getSessionAssignment;
exports.getVariantOutcomes = getVariantOutcomes;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createExperiment(data) {
    return client_js_1.prisma.experiment.create({ data });
}
async function getExperiment(id) {
    return client_js_1.prisma.experiment.findUnique({
        where: { id },
        include: { _count: { select: { assignments: true } } },
    });
}
async function updateExperiment(id, data) {
    return client_js_1.prisma.experiment.update({ where: { id }, data });
}
async function startExperiment(id) {
    return client_js_1.prisma.experiment.update({
        where: { id },
        data: { status: "running", startedAt: new Date() },
    });
}
async function endExperiment(id) {
    return client_js_1.prisma.experiment.update({
        where: { id },
        data: { status: "completed", endedAt: new Date() },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listExperiments(options) {
    const where = {};
    if (options?.status)
        where.status = options.status;
    if (options?.siteUrl !== undefined)
        where.siteUrl = options.siteUrl;
    return client_js_1.prisma.experiment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
        include: { _count: { select: { assignments: true } } },
    });
}
/**
 * Get the active (running) experiment for a site.
 * A session's site may match a site-specific experiment OR a global (null siteUrl) one.
 */
async function getActiveExperiment(siteUrl) {
    // Site-specific first
    if (siteUrl) {
        const siteExperiment = await client_js_1.prisma.experiment.findFirst({
            where: { status: "running", siteUrl },
        });
        if (siteExperiment)
            return siteExperiment;
    }
    // Global fallback
    return client_js_1.prisma.experiment.findFirst({
        where: { status: "running", siteUrl: null },
    });
}
// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
async function assignSession(experimentId, sessionId, variantId) {
    return client_js_1.prisma.experimentAssignment.create({
        data: { experimentId, sessionId, variantId },
    });
}
async function getSessionAssignment(experimentId, sessionId) {
    return client_js_1.prisma.experimentAssignment.findUnique({
        where: { experimentId_sessionId: { experimentId, sessionId } },
    });
}
// ---------------------------------------------------------------------------
// Metrics aggregation
// ---------------------------------------------------------------------------
/**
 * Get per-variant outcome counts by joining assignments → interventions.
 * Returns raw counts for each variant: total, converted, dismissed, ignored.
 */
async function getVariantOutcomes(experimentId) {
    const assignments = await client_js_1.prisma.experimentAssignment.findMany({
        where: { experimentId },
        select: { sessionId: true, variantId: true },
    });
    if (assignments.length === 0)
        return [];
    // Group sessions by variant
    const variantSessions = new Map();
    for (const a of assignments) {
        const sessions = variantSessions.get(a.variantId) ?? [];
        sessions.push(a.sessionId);
        variantSessions.set(a.variantId, sessions);
    }
    const results = [];
    for (const [variantId, sessionIds] of variantSessions) {
        const interventions = await client_js_1.prisma.intervention.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { status: true, mswimScoreAtFire: true },
        });
        // Also get evaluation signal averages
        const evalAggs = await client_js_1.prisma.evaluation.aggregate({
            where: { sessionId: { in: sessionIds } },
            _avg: {
                compositeScore: true,
                intentScore: true,
                frictionScore: true,
            },
        });
        const total = interventions.length;
        const converted = interventions.filter((i) => i.status === "converted").length;
        const dismissed = interventions.filter((i) => i.status === "dismissed").length;
        const ignored = interventions.filter((i) => i.status === "ignored").length;
        results.push({
            variantId,
            total,
            converted,
            dismissed,
            ignored,
            avgCompositeScore: evalAggs._avg.compositeScore ?? 0,
            avgIntentScore: evalAggs._avg.intentScore ?? 0,
            avgFrictionScore: evalAggs._avg.frictionScore ?? 0,
        });
    }
    return results;
}
//# sourceMappingURL=experiment.repo.js.map