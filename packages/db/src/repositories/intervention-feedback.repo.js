"use strict";
// ============================================================================
// InterventionFeedback Repository — user thumbs up/down on interventions
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFeedback = createFeedback;
exports.getFeedbackByIntervention = getFeedbackByIntervention;
exports.getFeedbackStats = getFeedbackStats;
const client_js_1 = require("../client.js");
async function createFeedback(data) {
    return client_js_1.prisma.interventionFeedback.create({ data });
}
async function getFeedbackByIntervention(interventionId) {
    return client_js_1.prisma.interventionFeedback.findFirst({
        where: { interventionId },
        orderBy: { createdAt: "desc" },
    });
}
async function getFeedbackStats(options) {
    const where = {};
    if (options?.since) {
        where.createdAt = { gte: options.since };
    }
    const results = await client_js_1.prisma.interventionFeedback.groupBy({
        by: ["feedback"],
        where,
        _count: { id: true },
    });
    return results.map((r) => ({
        feedback: r.feedback,
        count: r._count.id,
    }));
}
//# sourceMappingURL=intervention-feedback.repo.js.map