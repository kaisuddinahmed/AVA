"use strict";
// ============================================================================
// Rollout Repository — staged config changes with health checks
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRollout = createRollout;
exports.getRollout = getRollout;
exports.updateRollout = updateRollout;
exports.advanceStage = advanceStage;
exports.completeRollout = completeRollout;
exports.rollback = rollback;
exports.getActiveRollout = getActiveRollout;
exports.listRollouts = listRollouts;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createRollout(data) {
    return client_js_1.prisma.rollout.create({ data });
}
async function getRollout(id) {
    return client_js_1.prisma.rollout.findUnique({
        where: { id },
        include: { experiment: true },
    });
}
async function updateRollout(id, data) {
    return client_js_1.prisma.rollout.update({ where: { id }, data });
}
// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
async function advanceStage(id) {
    return client_js_1.prisma.rollout.update({
        where: { id },
        data: { currentStage: { increment: 1 } },
    });
}
async function completeRollout(id) {
    return client_js_1.prisma.rollout.update({
        where: { id },
        data: {
            status: "completed",
            completedAt: new Date(),
        },
    });
}
async function rollback(id, reason) {
    return client_js_1.prisma.rollout.update({
        where: { id },
        data: {
            status: "rolled_back",
            rolledBackAt: new Date(),
            rollbackReason: reason,
        },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function getActiveRollout(siteUrl) {
    // Site-specific first
    if (siteUrl) {
        const siteRollout = await client_js_1.prisma.rollout.findFirst({
            where: { status: "rolling", siteUrl },
            include: { experiment: true },
        });
        if (siteRollout)
            return siteRollout;
    }
    // Global fallback
    return client_js_1.prisma.rollout.findFirst({
        where: { status: "rolling", siteUrl: null },
        include: { experiment: true },
    });
}
async function listRollouts(options) {
    const where = {};
    if (options?.status)
        where.status = options.status;
    if (options?.siteUrl !== undefined)
        where.siteUrl = options.siteUrl;
    return client_js_1.prisma.rollout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
        include: { experiment: true },
    });
}
//# sourceMappingURL=rollout.repo.js.map