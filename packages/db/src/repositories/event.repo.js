"use strict";
// ============================================================================
// Event Repository — TrackEvent persistence & queries
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.createEventBatch = createEventBatch;
exports.getEvent = getEvent;
exports.getEventsBySession = getEventsBySession;
exports.getRecentEvents = getRecentEvents;
exports.getEventsByIds = getEventsByIds;
exports.getEventsByFriction = getEventsByFriction;
exports.getUnevaluatedEvents = getUnevaluatedEvents;
exports.countEventsBySession = countEventsBySession;
exports.getPageViewSequence = getPageViewSequence;
exports.getPageFlowGraph = getPageFlowGraph;
exports.getFunnelStepCounts = getFunnelStepCounts;
exports.getAvgTimeOnPage = getAvgTimeOnPage;
exports.getAvgScrollDepth = getAvgScrollDepth;
exports.getClickCoordinates = getClickCoordinates;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createEvent(data) {
    return client_js_1.prisma.trackEvent.create({ data });
}
async function createEventBatch(events) {
    return client_js_1.prisma.trackEvent.createMany({ data: events });
}
async function getEvent(id) {
    return client_js_1.prisma.trackEvent.findUnique({ where: { id } });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function getEventsBySession(sessionId, options) {
    return client_js_1.prisma.trackEvent.findMany({
        where: {
            sessionId,
            ...(options?.since ? { timestamp: { gte: options.since } } : {}),
        },
        orderBy: { timestamp: "asc" },
        take: options?.limit,
    });
}
async function getRecentEvents(sessionId, count = 10) {
    return client_js_1.prisma.trackEvent.findMany({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
        take: count,
    });
}
async function getEventsByIds(ids) {
    return client_js_1.prisma.trackEvent.findMany({
        where: { id: { in: ids } },
        orderBy: { timestamp: "asc" },
    });
}
async function getEventsByFriction(frictionId) {
    return client_js_1.prisma.trackEvent.findMany({
        where: { frictionId },
        orderBy: { timestamp: "desc" },
        take: 50,
    });
}
async function getUnevaluatedEvents(sessionId, evaluatedEventIds) {
    return client_js_1.prisma.trackEvent.findMany({
        where: {
            sessionId,
            id: { notIn: evaluatedEventIds },
        },
        orderBy: { timestamp: "asc" },
    });
}
async function countEventsBySession(sessionId) {
    return client_js_1.prisma.trackEvent.count({ where: { sessionId } });
}
// ---------------------------------------------------------------------------
// Analytics queries
// ---------------------------------------------------------------------------
/** Returns ordered page_view events for a session — for flow reconstruction */
async function getPageViewSequence(sessionId) {
    return client_js_1.prisma.trackEvent.findMany({
        where: { sessionId, eventType: "page_view" },
        orderBy: { timestamp: "asc" },
        select: { pageUrl: true, previousPageUrl: true, timestamp: true, pageType: true },
    });
}
/**
 * Returns top page-to-page transitions for a site.
 * Groups (previousPageUrl → pageUrl) pairs and counts occurrences.
 * Requires previousPageUrl to have been populated by the normalizer.
 */
async function getPageFlowGraph(siteUrl, since, limit = 20) {
    const events = await client_js_1.prisma.trackEvent.findMany({
        where: {
            siteUrl,
            eventType: "page_view",
            previousPageUrl: { not: null },
            ...(since ? { timestamp: { gte: since } } : {}),
        },
        select: { previousPageUrl: true, pageUrl: true, pageType: true },
        take: 5000, // cap scan for perf
    });
    // Group in application memory (SQLite has no GROUP BY on JSON / computed fields easily)
    const counts = new Map();
    for (const e of events) {
        const key = `${e.previousPageUrl}→${e.pageUrl}`;
        const existing = counts.get(key);
        if (existing) {
            existing.count++;
        }
        else {
            counts.set(key, { from: e.previousPageUrl, to: e.pageUrl, count: 1 });
        }
    }
    return [...counts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
/**
 * Counts sessions reaching each funnel step (pageType) in order.
 * Returns drop-off percentages per step.
 */
async function getFunnelStepCounts(siteUrl, steps, since) {
    const results = [];
    for (const step of steps) {
        const count = await client_js_1.prisma.trackEvent.findMany({
            where: {
                siteUrl,
                pageType: step,
                ...(since ? { timestamp: { gte: since } } : {}),
            },
            select: { sessionId: true },
            distinct: ["sessionId"],
        });
        results.push({ step, sessionCount: count.length });
    }
    return results;
}
/** Average time on page grouped by pageUrl, for the top N pages */
async function getAvgTimeOnPage(siteUrl, since, pageType, limit = 20) {
    const events = await client_js_1.prisma.trackEvent.findMany({
        where: {
            siteUrl,
            timeOnPageMs: { not: null, gt: 0 },
            ...(pageType ? { pageType } : {}),
            ...(since ? { timestamp: { gte: since } } : {}),
        },
        select: { pageUrl: true, pageType: true, timeOnPageMs: true },
        take: 10000,
    });
    const groups = new Map();
    for (const e of events) {
        const existing = groups.get(e.pageUrl);
        if (existing) {
            existing.total += e.timeOnPageMs;
            existing.count++;
        }
        else {
            groups.set(e.pageUrl, { pageUrl: e.pageUrl, pageType: e.pageType, total: e.timeOnPageMs, count: 1 });
        }
    }
    return [...groups.values()]
        .map(g => ({ pageUrl: g.pageUrl, pageType: g.pageType, avgTimeOnPageMs: Math.round(g.total / g.count), views: g.count }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
}
/** Average scroll depth grouped by pageType */
async function getAvgScrollDepth(siteUrl, since, pageType) {
    const events = await client_js_1.prisma.trackEvent.findMany({
        where: {
            siteUrl,
            scrollDepthPct: { not: null },
            ...(pageType ? { pageType } : {}),
            ...(since ? { timestamp: { gte: since } } : {}),
        },
        select: { pageType: true, scrollDepthPct: true },
        take: 10000,
    });
    const groups = new Map();
    for (const e of events) {
        const key = e.pageType;
        const existing = groups.get(key);
        if (existing) {
            existing.total += e.scrollDepthPct;
            existing.count++;
        }
        else {
            groups.set(key, { total: e.scrollDepthPct, count: 1 });
        }
    }
    return [...groups.entries()].map(([pt, g]) => ({
        pageType: pt,
        avgScrollDepthPct: Math.round(g.total / g.count),
        sampleCount: g.count,
    }));
}
/** Returns click events with coordinates for heatmap rendering */
async function getClickCoordinates(siteUrl, since, pageUrl, limit = 2000) {
    const events = await client_js_1.prisma.trackEvent.findMany({
        where: {
            siteUrl,
            eventType: "click",
            ...(pageUrl ? { pageUrl } : {}),
            ...(since ? { timestamp: { gte: since } } : {}),
        },
        select: { rawSignals: true, pageUrl: true },
        take: limit,
    });
    const points = [];
    for (const e of events) {
        try {
            const signals = JSON.parse(e.rawSignals);
            if (signals.x_pct !== undefined && signals.y_pct !== undefined) {
                points.push({
                    xPct: Number(signals.x_pct),
                    yPct: Number(signals.y_pct),
                    pageUrl: e.pageUrl,
                });
            }
        }
        catch {
            // skip unparseable
        }
    }
    return points;
}
//# sourceMappingURL=event.repo.js.map