"use strict";
// ============================================================================
// TrainingDatapoint Repository — denormalized training data for LLM fine-tuning
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatapoint = createDatapoint;
exports.getDatapoint = getDatapoint;
exports.getDatapointByInterventionId = getDatapointByInterventionId;
exports.listDatapoints = listDatapoints;
exports.countDatapoints = countDatapoints;
exports.getOutcomeDistribution = getOutcomeDistribution;
exports.updateUserFeedback = updateUserFeedback;
exports.getTierOutcomeCrossTab = getTierOutcomeCrossTab;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createDatapoint(data) {
    return client_js_1.prisma.trainingDatapoint.create({ data });
}
async function getDatapoint(id) {
    return client_js_1.prisma.trainingDatapoint.findUnique({ where: { id } });
}
async function getDatapointByInterventionId(interventionId) {
    return client_js_1.prisma.trainingDatapoint.findUnique({ where: { interventionId } });
}
// ---------------------------------------------------------------------------
// Queries for export
// ---------------------------------------------------------------------------
async function listDatapoints(options) {
    const where = {};
    if (options?.outcome)
        where.outcome = options.outcome;
    if (options?.tier)
        where.tier = options.tier;
    if (options?.siteUrl)
        where.siteUrl = options.siteUrl;
    if (options?.frictionId)
        where.frictionId = options.frictionId;
    if (options?.interventionType)
        where.interventionType = options.interventionType;
    if (options?.since || options?.until) {
        const dateFilter = {};
        if (options?.since)
            dateFilter.gte = options.since;
        if (options?.until)
            dateFilter.lte = options.until;
        where.createdAt = dateFilter;
    }
    return client_js_1.prisma.trainingDatapoint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
    });
}
async function countDatapoints(options) {
    const where = {};
    if (options?.outcome)
        where.outcome = options.outcome;
    if (options?.tier)
        where.tier = options.tier;
    if (options?.siteUrl)
        where.siteUrl = options.siteUrl;
    return client_js_1.prisma.trainingDatapoint.count({ where });
}
/**
 * Get outcome distribution for diagnostics.
 */
async function getOutcomeDistribution(siteUrl) {
    const where = siteUrl ? { siteUrl } : {};
    const results = await client_js_1.prisma.trainingDatapoint.groupBy({
        by: ["outcome"],
        where,
        _count: { id: true },
    });
    return results.map((r) => ({
        outcome: r.outcome,
        count: r._count.id,
    }));
}
/**
 * Update user feedback on a training datapoint (enrichment from InterventionFeedback).
 */
async function updateUserFeedback(interventionId, feedback) {
    return client_js_1.prisma.trainingDatapoint.update({
        where: { interventionId },
        data: { userFeedback: feedback },
    });
}
/**
 * Get tier × outcome cross-tabulation for model analysis.
 */
async function getTierOutcomeCrossTab(siteUrl) {
    const where = siteUrl ? { siteUrl } : {};
    const results = await client_js_1.prisma.trainingDatapoint.groupBy({
        by: ["tier", "outcome"],
        where,
        _count: { id: true },
        _avg: { compositeScore: true },
    });
    return results.map((r) => ({
        tier: r.tier,
        outcome: r.outcome,
        count: r._count.id,
        avgCompositeScore: r._avg.compositeScore,
    }));
}
//# sourceMappingURL=training-datapoint.repo.js.map