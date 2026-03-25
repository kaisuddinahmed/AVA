"use strict";
// ============================================================================
// InsightSnapshot Repository — merchant insight + CRO recommendation storage
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInsightSnapshot = createInsightSnapshot;
exports.getLatestInsightSnapshot = getLatestInsightSnapshot;
exports.getLatestCROFindings = getLatestCROFindings;
exports.listInsightSnapshots = listInsightSnapshots;
const client_js_1 = require("../client.js");
async function createInsightSnapshot(data) {
    return client_js_1.prisma.insightSnapshot.create({ data });
}
async function getLatestInsightSnapshot(siteUrl) {
    return client_js_1.prisma.insightSnapshot.findFirst({
        where: { siteUrl },
        orderBy: { createdAt: "desc" },
    });
}
async function getLatestCROFindings(siteUrl) {
    const snap = await client_js_1.prisma.insightSnapshot.findFirst({
        where: { siteUrl, croFindings: { not: null } },
        orderBy: { createdAt: "desc" },
    });
    return snap;
}
async function listInsightSnapshots(siteUrl, limit = 10) {
    return client_js_1.prisma.insightSnapshot.findMany({
        where: { siteUrl },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
//# sourceMappingURL=insight-snapshot.repo.js.map