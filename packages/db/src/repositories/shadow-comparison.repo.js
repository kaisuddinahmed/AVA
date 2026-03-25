"use strict";
// ============================================================================
// ShadowComparison Repository — dual-path evaluation comparison data
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComparison = createComparison;
exports.getComparison = getComparison;
exports.getComparisonsBySession = getComparisonsBySession;
exports.listComparisons = listComparisons;
exports.getStats = getStats;
exports.getTopDivergences = getTopDivergences;
exports.getDivergenceDistribution = getDivergenceDistribution;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createComparison(data) {
    return client_js_1.prisma.shadowComparison.create({ data });
}
async function getComparison(id) {
    return client_js_1.prisma.shadowComparison.findUnique({ where: { id } });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function getComparisonsBySession(sessionId) {
    return client_js_1.prisma.shadowComparison.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
    });
}
async function listComparisons(options) {
    const where = {};
    if (options?.sessionId)
        where.sessionId = options.sessionId;
    if (options?.tierMatch !== undefined)
        where.tierMatch = options.tierMatch;
    if (options?.decisionMatch !== undefined)
        where.decisionMatch = options.decisionMatch;
    if (options?.minDivergence !== undefined) {
        where.compositeDivergence = { gte: options.minDivergence };
    }
    return client_js_1.prisma.shadowComparison.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
    });
}
// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------
async function getStats() {
    const [total, tierMatches, decisionMatches, avgDivergence] = await Promise.all([
        client_js_1.prisma.shadowComparison.count(),
        client_js_1.prisma.shadowComparison.count({ where: { tierMatch: true } }),
        client_js_1.prisma.shadowComparison.count({ where: { decisionMatch: true } }),
        client_js_1.prisma.shadowComparison.aggregate({
            _avg: { compositeDivergence: true },
        }),
    ]);
    return {
        totalComparisons: total,
        tierAgreementRate: total > 0 ? tierMatches / total : 0,
        decisionAgreementRate: total > 0 ? decisionMatches / total : 0,
        avgCompositeDivergence: avgDivergence._avg.compositeDivergence ?? 0,
        tierMatches,
        tierMismatches: total - tierMatches,
        decisionMatches,
        decisionMismatches: total - decisionMatches,
    };
}
async function getTopDivergences(limit = 20) {
    return client_js_1.prisma.shadowComparison.findMany({
        where: { decisionMatch: false },
        orderBy: { compositeDivergence: "desc" },
        take: limit,
    });
}
async function getDivergenceDistribution() {
    const results = await client_js_1.prisma.shadowComparison.groupBy({
        by: ["tierMatch", "decisionMatch"],
        _count: { id: true },
        _avg: { compositeDivergence: true },
    });
    return results.map((r) => ({
        tierMatch: r.tierMatch,
        decisionMatch: r.decisionMatch,
        count: r._count.id,
        avgDivergence: r._avg.compositeDivergence,
    }));
}
//# sourceMappingURL=shadow-comparison.repo.js.map