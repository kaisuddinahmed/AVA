"use strict";
// ============================================================================
// Intervention Repository — intervention tracking + outcome recording
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIntervention = createIntervention;
exports.getIntervention = getIntervention;
exports.recordOutcome = recordOutcome;
exports.getInterventionsBySession = getInterventionsBySession;
exports.getRecentInterventionsBySession = getRecentInterventionsBySession;
exports.getInterventionsByStatus = getInterventionsByStatus;
exports.getInterventionsByType = getInterventionsByType;
exports.countInterventionsByType = countInterventionsByType;
exports.getLastIntervention = getLastIntervention;
exports.getInterventionsByFriction = getInterventionsByFriction;
exports.listInterventions = listInterventions;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createIntervention(data) {
    return client_js_1.prisma.intervention.create({ data });
}
async function getIntervention(id) {
    return client_js_1.prisma.intervention.findUnique({
        where: { id },
        include: { evaluation: true },
    });
}
// ---------------------------------------------------------------------------
// Outcome tracking
// ---------------------------------------------------------------------------
async function recordOutcome(id, outcome) {
    const now = new Date();
    const timestampField = {};
    switch (outcome.status) {
        case "delivered":
            timestampField.deliveredAt = now;
            break;
        case "dismissed":
            timestampField.dismissedAt = now;
            break;
        case "converted":
            timestampField.convertedAt = now;
            break;
        case "ignored":
            timestampField.ignoredAt = now;
            break;
    }
    return client_js_1.prisma.intervention.update({
        where: { id },
        data: {
            status: outcome.status,
            ...timestampField,
            ...(outcome.conversionAction
                ? { conversionAction: outcome.conversionAction }
                : {}),
        },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function getInterventionsBySession(sessionId) {
    return client_js_1.prisma.intervention.findMany({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
    });
}
async function getRecentInterventionsBySession(sessionId, limit = 5) {
    return client_js_1.prisma.intervention.findMany({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
        take: limit,
    });
}
async function getInterventionsByStatus(status, limit = 20) {
    return client_js_1.prisma.intervention.findMany({
        where: { status },
        orderBy: { timestamp: "desc" },
        take: limit,
    });
}
async function getInterventionsByType(type, options) {
    return client_js_1.prisma.intervention.findMany({
        where: {
            type,
            ...(options?.status ? { status: options.status } : {}),
        },
        orderBy: { timestamp: "desc" },
        take: options?.limit ?? 20,
    });
}
/**
 * Count interventions by type for a given session (for MSWIM gate checks).
 */
async function countInterventionsByType(sessionId, type) {
    return client_js_1.prisma.intervention.count({
        where: { sessionId, type },
    });
}
/**
 * Get the last intervention for a session (for cooldown checks).
 */
async function getLastIntervention(sessionId) {
    return client_js_1.prisma.intervention.findFirst({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
    });
}
/**
 * Get interventions for a specific friction ID (for duplicate gate checks).
 */
async function getInterventionsByFriction(sessionId, frictionId) {
    return client_js_1.prisma.intervention.findMany({
        where: { sessionId, frictionId },
        orderBy: { timestamp: "desc" },
    });
}
/**
 * List all interventions with optional limit, time filter, and site scoping.
 */
async function listInterventions(options) {
    const where = {};
    if (options?.since)
        where.timestamp = { gte: options.since };
    if (options?.siteUrl)
        where.session = { siteUrl: options.siteUrl };
    return client_js_1.prisma.intervention.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: options?.limit ?? 100,
    });
}
//# sourceMappingURL=intervention.repo.js.map