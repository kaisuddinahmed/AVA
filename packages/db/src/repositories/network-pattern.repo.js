"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertNetworkPattern = upsertNetworkPattern;
exports.getNetworkPattern = getNetworkPattern;
exports.listNetworkPatterns = listNetworkPatterns;
exports.countNetworkPatterns = countNetworkPatterns;
const client_js_1 = require("../client.js");
/**
 * Upsert a network pattern record. Called by the weekly flywheel job.
 * Enforces k-anonymity: only writes when merchantCount >= 3.
 */
async function upsertNetworkPattern(data) {
    if (data.merchantCount < 3)
        return null; // k-anonymity floor
    return client_js_1.prisma.networkPattern.upsert({
        where: { frictionId: data.frictionId },
        create: data,
        update: {
            category: data.category,
            avgSeverity: data.avgSeverity,
            avgConversionImpact: data.avgConversionImpact,
            merchantCount: data.merchantCount,
            totalSessions: data.totalSessions,
        },
    });
}
/**
 * Get a single network pattern for a given frictionId.
 * Used by fast evaluator as a prior for new merchants.
 */
async function getNetworkPattern(frictionId) {
    return client_js_1.prisma.networkPattern.findUnique({ where: { frictionId } });
}
/**
 * Get all network patterns, ordered by impact (highest first).
 */
async function listNetworkPatterns() {
    return client_js_1.prisma.networkPattern.findMany({
        orderBy: { avgConversionImpact: "desc" },
    });
}
/**
 * Count the number of published network patterns.
 */
async function countNetworkPatterns() {
    return client_js_1.prisma.networkPattern.count();
}
//# sourceMappingURL=network-pattern.repo.js.map