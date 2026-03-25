"use strict";
// ============================================================================
// Evaluation Repository — LLM evaluation results with MSWIM scores
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvaluation = createEvaluation;
exports.getEvaluation = getEvaluation;
exports.getEvaluationsBySession = getEvaluationsBySession;
exports.getLatestEvaluation = getLatestEvaluation;
exports.getEvaluationsByTier = getEvaluationsByTier;
exports.getEvaluationsBySite = getEvaluationsBySite;
exports.listEvaluations = listEvaluations;
exports.getEvaluatedEventIds = getEvaluatedEventIds;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createEvaluation(data) {
    return client_js_1.prisma.evaluation.create({ data });
}
async function getEvaluation(id) {
    return client_js_1.prisma.evaluation.findUnique({
        where: { id },
        include: { intervention: true },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function getEvaluationsBySession(sessionId) {
    return client_js_1.prisma.evaluation.findMany({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
        include: { intervention: true },
    });
}
async function getLatestEvaluation(sessionId) {
    return client_js_1.prisma.evaluation.findFirst({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
        include: { intervention: true },
    });
}
async function getEvaluationsByTier(tier, limit = 20) {
    return client_js_1.prisma.evaluation.findMany({
        where: { tier },
        orderBy: { timestamp: "desc" },
        take: limit,
    });
}
async function getEvaluationsBySite(siteUrl, limit = 50) {
    return client_js_1.prisma.evaluation.findMany({
        where: { session: { siteUrl } },
        orderBy: { timestamp: "desc" },
        take: limit,
        include: { session: { select: { siteUrl: true, visitorId: true } } },
    });
}
/**
 * List all evaluations with optional limit and time filter (for analytics).
 */
async function listEvaluations(options) {
    const where = {};
    if (options?.since)
        where.timestamp = { gte: options.since };
    if (options?.siteUrl)
        where.session = { siteUrl: options.siteUrl };
    return client_js_1.prisma.evaluation.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: options?.limit ?? 100,
    });
}
/**
 * Get all evaluated event IDs for a session (to avoid re-evaluating).
 */
async function getEvaluatedEventIds(sessionId) {
    const evals = await client_js_1.prisma.evaluation.findMany({
        where: { sessionId },
        select: { eventBatchIds: true },
    });
    const ids = [];
    for (const e of evals) {
        try {
            const batch = JSON.parse(e.eventBatchIds);
            ids.push(...batch);
        }
        catch {
            // skip malformed
        }
    }
    return ids;
}
//# sourceMappingURL=evaluation.repo.js.map