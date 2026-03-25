"use strict";
// ============================================================================
// Session Repository — CRUD + MSWIM counter updates
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getSession = getSession;
exports.getSessionFull = getSessionFull;
exports.updateSession = updateSession;
exports.touchSession = touchSession;
exports.endSession = endSession;
exports.incrementInterventionsFired = incrementInterventionsFired;
exports.incrementDismissals = incrementDismissals;
exports.incrementConversions = incrementConversions;
exports.addAttributedRevenue = addAttributedRevenue;
exports.markControlSession = markControlSession;
exports.setSuppressNonPassive = setSuppressNonPassive;
exports.incrementVoiceInterventionsFired = incrementVoiceInterventionsFired;
exports.setVoiceMuted = setVoiceMuted;
exports.listActiveSessions = listActiveSessions;
exports.getRecentSessions = getRecentSessions;
exports.incrementPageViews = incrementPageViews;
exports.setEntryPage = setEntryPage;
exports.setExitPage = setExitPage;
exports.accumulateTimeOnSite = accumulateTimeOnSite;
exports.getBounceRate = getBounceRate;
exports.getTrafficSourceBreakdown = getTrafficSourceBreakdown;
exports.getDeviceBreakdown = getDeviceBreakdown;
exports.getSessionVolumeByDay = getSessionVolumeByDay;
exports.getRetentionCohort = getRetentionCohort;
exports.getAvgSessionDuration = getAvgSessionDuration;
exports.getAvgPageViews = getAvgPageViews;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createSession(data) {
    return client_js_1.prisma.session.create({ data });
}
async function getSession(id) {
    return client_js_1.prisma.session.findUnique({
        where: { id },
        include: { events: false, evaluations: false, interventions: false },
    });
}
async function getSessionFull(id) {
    return client_js_1.prisma.session.findUnique({
        where: { id },
        include: {
            events: { orderBy: { timestamp: "asc" } },
            evaluations: { orderBy: { timestamp: "desc" }, take: 5 },
            interventions: { orderBy: { timestamp: "desc" }, take: 10 },
        },
    });
}
async function updateSession(id, data) {
    return client_js_1.prisma.session.update({ where: { id }, data });
}
async function touchSession(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { lastActivityAt: new Date() },
    });
}
async function endSession(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { status: "ended", lastActivityAt: new Date() },
    });
}
// ---------------------------------------------------------------------------
// MSWIM counter helpers
// ---------------------------------------------------------------------------
async function incrementInterventionsFired(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalInterventionsFired: { increment: 1 } },
    });
}
async function incrementDismissals(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalDismissals: { increment: 1 } },
    });
}
async function incrementConversions(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalConversions: { increment: 1 } },
    });
}
/**
 * Add cart lift to Session.attributedRevenue.
 * Called when an intervention converts — adds the delta (cartNow - cartAtFire).
 */
async function addAttributedRevenue(id, lift) {
    if (lift <= 0)
        return;
    return client_js_1.prisma.session.update({
        where: { id },
        data: { attributedRevenue: { increment: lift } },
    });
}
/**
 * Mark session as part of the 5% control group (no interventions fired).
 */
async function markControlSession(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { isControlSession: true },
    });
}
async function setSuppressNonPassive(id, suppress) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { suppressNonPassive: suppress },
    });
}
async function incrementVoiceInterventionsFired(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalVoiceInterventionsFired: { increment: 1 } },
    });
}
async function setVoiceMuted(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { voiceMuted: true },
    });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listActiveSessions(siteUrl) {
    const where = { status: "active" };
    if (siteUrl)
        where.siteUrl = siteUrl;
    return client_js_1.prisma.session.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        take: 50,
    });
}
async function getRecentSessions(limit = 20) {
    return client_js_1.prisma.session.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
    });
}
// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------
async function incrementPageViews(id) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalPageViews: { increment: 1 } },
    });
}
async function setEntryPage(id, url, opts = {}) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { entryPage: url, ...opts },
    });
}
async function setExitPage(id, url) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { exitPage: url, endedAt: new Date() },
    });
}
async function accumulateTimeOnSite(id, ms) {
    return client_js_1.prisma.session.update({
        where: { id },
        data: { totalTimeOnSiteMs: { increment: ms } },
    });
}
// ---------------------------------------------------------------------------
// Analytics queries
// ---------------------------------------------------------------------------
/** Bounce rate: sessions with exactly 1 page view divided by total sessions */
async function getBounceRate(siteUrl, since) {
    const where = {
        siteUrl,
        ...(since ? { startedAt: { gte: since } } : {}),
    };
    const [total, bounced] = await Promise.all([
        client_js_1.prisma.session.count({ where }),
        client_js_1.prisma.session.count({ where: { ...where, totalPageViews: 1 } }),
    ]);
    return { total, bounced, bounceRate: total > 0 ? bounced / total : 0 };
}
/** Traffic source breakdown: group by referrerType with conversion stats */
async function getTrafficSourceBreakdown(siteUrl, since) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
        select: { referrerType: true, totalConversions: true },
        take: 5000,
    });
    const groups = new Map();
    for (const s of sessions) {
        const key = s.referrerType || "direct";
        const existing = groups.get(key) ?? { sessions: 0, conversions: 0 };
        existing.sessions++;
        existing.conversions += s.totalConversions;
        groups.set(key, existing);
    }
    return [...groups.entries()].map(([referrerType, g]) => ({
        referrerType,
        sessions: g.sessions,
        conversions: g.conversions,
        conversionRate: g.sessions > 0 ? g.conversions / g.sessions : 0,
    })).sort((a, b) => b.sessions - a.sessions);
}
/** Device type breakdown with conversion stats */
async function getDeviceBreakdown(siteUrl, since) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
        select: { deviceType: true, totalConversions: true },
        take: 5000,
    });
    const groups = new Map();
    for (const s of sessions) {
        const key = s.deviceType || "desktop";
        const existing = groups.get(key) ?? { sessions: 0, conversions: 0 };
        existing.sessions++;
        existing.conversions += s.totalConversions;
        groups.set(key, existing);
    }
    return [...groups.entries()].map(([deviceType, g]) => ({
        deviceType,
        sessions: g.sessions,
        conversions: g.conversions,
        conversionRate: g.sessions > 0 ? g.conversions / g.sessions : 0,
    }));
}
/** Daily session volume over a time range */
async function getSessionVolumeByDay(siteUrl, since, until) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: {
            siteUrl,
            ...(since ? { startedAt: { gte: since } } : {}),
            ...(until ? { startedAt: { lte: until } } : {}),
        },
        select: { startedAt: true },
        orderBy: { startedAt: "asc" },
    });
    const buckets = new Map();
    for (const s of sessions) {
        const day = s.startedAt.toISOString().slice(0, 10); // YYYY-MM-DD
        buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}
/** Weekly retention cohort: new vs returning visitors by ISO week */
async function getRetentionCohort(siteUrl, since, until) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: {
            siteUrl,
            ...(since ? { startedAt: { gte: since } } : {}),
            ...(until ? { startedAt: { lte: until } } : {}),
        },
        select: { startedAt: true, isRepeatVisitor: true },
    });
    const buckets = new Map();
    for (const s of sessions) {
        const d = s.startedAt;
        // ISO week label: YYYY-Www
        const week = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, "0")}`;
        const existing = buckets.get(week) ?? { new: 0, returning: 0 };
        if (s.isRepeatVisitor)
            existing.returning++;
        else
            existing.new++;
        buckets.set(week, existing);
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, g]) => ({ week, ...g, total: g.new + g.returning }));
}
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
/** Avg session duration using lastActivityAt - startedAt as proxy */
async function getAvgSessionDuration(siteUrl, since) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
        select: { startedAt: true, lastActivityAt: true },
        take: 5000,
    });
    if (sessions.length === 0)
        return 0;
    const totalMs = sessions.reduce((sum, s) => sum + (s.lastActivityAt.getTime() - s.startedAt.getTime()), 0);
    return Math.round(totalMs / sessions.length);
}
/** Avg page views per session */
async function getAvgPageViews(siteUrl, since) {
    const sessions = await client_js_1.prisma.session.findMany({
        where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
        select: { totalPageViews: true },
        take: 5000,
    });
    if (sessions.length === 0)
        return 0;
    const total = sessions.reduce((sum, s) => sum + s.totalPageViews, 0);
    return Math.round((total / sessions.length) * 10) / 10;
}
//# sourceMappingURL=session.repo.js.map