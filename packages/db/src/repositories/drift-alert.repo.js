"use strict";
// ============================================================================
// DriftAlert Repository — detected scoring/model anomalies
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAlert = createAlert;
exports.acknowledgeAlert = acknowledgeAlert;
exports.resolveAlert = resolveAlert;
exports.listAlerts = listAlerts;
exports.getActiveAlerts = getActiveAlerts;
exports.countBySeverity = countBySeverity;
exports.hasRecentAlert = hasRecentAlert;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createAlert(data) {
    return client_js_1.prisma.driftAlert.create({ data });
}
async function acknowledgeAlert(id) {
    return client_js_1.prisma.driftAlert.update({
        where: { id },
        data: { acknowledged: true, acknowledgedAt: new Date() },
    });
}
async function resolveAlert(id) {
    return client_js_1.prisma.driftAlert.update({
        where: { id },
        data: { resolvedAt: new Date() },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listAlerts(options) {
    const where = {};
    if (options?.siteUrl !== undefined)
        where.siteUrl = options.siteUrl;
    if (options?.alertType)
        where.alertType = options.alertType;
    if (options?.severity)
        where.severity = options.severity;
    if (options?.acknowledged !== undefined)
        where.acknowledged = options.acknowledged;
    return client_js_1.prisma.driftAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
    });
}
async function getActiveAlerts(siteUrl) {
    return client_js_1.prisma.driftAlert.findMany({
        where: {
            resolvedAt: null,
            ...(siteUrl !== undefined ? { siteUrl } : {}),
        },
        orderBy: { createdAt: "desc" },
    });
}
async function countBySeverity(since) {
    const where = {};
    if (since)
        where.createdAt = { gte: since };
    const results = await client_js_1.prisma.driftAlert.groupBy({
        by: ["severity"],
        where,
        _count: { id: true },
    });
    return results.reduce((acc, r) => {
        acc[r.severity] = r._count.id;
        return acc;
    }, {});
}
/**
 * Check if a similar alert already exists (for dedup).
 * Returns true if an unresolved alert of the same type/window exists within the last N hours.
 */
async function hasRecentAlert(alertType, windowType, siteUrl, withinHours = 6) {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const count = await client_js_1.prisma.driftAlert.count({
        where: {
            alertType,
            windowType,
            siteUrl,
            resolvedAt: null,
            createdAt: { gte: since },
        },
    });
    return count > 0;
}
//# sourceMappingURL=drift-alert.repo.js.map