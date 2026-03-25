"use strict";
// ============================================================================
// DriftSnapshot Repository — periodic metric snapshots for trend analysis
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSnapshot = createSnapshot;
exports.listSnapshots = listSnapshots;
exports.getLatestSnapshot = getLatestSnapshot;
exports.pruneOldSnapshots = pruneOldSnapshots;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createSnapshot(data) {
    return client_js_1.prisma.driftSnapshot.create({ data });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listSnapshots(options) {
    const where = {};
    if (options?.siteUrl !== undefined)
        where.siteUrl = options.siteUrl;
    if (options?.windowType)
        where.windowType = options.windowType;
    if (options?.since || options?.until) {
        const createdAt = {};
        if (options.since)
            createdAt.gte = options.since;
        if (options.until)
            createdAt.lte = options.until;
        where.createdAt = createdAt;
    }
    return client_js_1.prisma.driftSnapshot.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
    });
}
async function getLatestSnapshot(windowType, siteUrl) {
    return client_js_1.prisma.driftSnapshot.findFirst({
        where: {
            windowType,
            siteUrl: siteUrl ?? null,
        },
        orderBy: { createdAt: "desc" },
    });
}
async function pruneOldSnapshots(olderThan) {
    return client_js_1.prisma.driftSnapshot.deleteMany({
        where: { createdAt: { lt: olderThan } },
    });
}
//# sourceMappingURL=drift-snapshot.repo.js.map