// ============================================================================
// Event Repository — TrackEvent persistence & queries
// ============================================================================
import { prisma } from "../client.js";
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createEvent(data) {
    return prisma.trackEvent.create({ data });
}
export async function createEventBatch(events) {
    // createMany crashes in Prisma WASM — loop single creates instead
    for (const ev of events) {
        await prisma.trackEvent.create({ data: ev });
    }
    return { count: events.length };
}
export async function getEvent(id) {
    return prisma.trackEvent.findUnique({ where: { id } });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function getEventsBySession(sessionId, options) {
    return prisma.trackEvent.findMany({
        where: {
            sessionId,
            ...(options?.since ? { timestamp: { gte: options.since } } : {}),
        },
        orderBy: { timestamp: "asc" },
        take: options?.limit,
    });
}
export async function getRecentEvents(sessionId, count = 10) {
    return prisma.trackEvent.findMany({
        where: { sessionId },
        orderBy: { timestamp: "desc" },
        take: count,
    });
}
export async function getEventsByIds(ids) {
    return prisma.trackEvent.findMany({
        where: { id: { in: ids } },
        orderBy: { timestamp: "asc" },
    });
}
export async function getEventsByFriction(frictionId) {
    return prisma.trackEvent.findMany({
        where: { frictionId },
        orderBy: { timestamp: "desc" },
        take: 50,
    });
}
export async function getUnevaluatedEvents(sessionId, evaluatedEventIds) {
    return prisma.trackEvent.findMany({
        where: {
            sessionId,
            id: { notIn: evaluatedEventIds },
        },
        orderBy: { timestamp: "asc" },
    });
}
export async function countEventsBySession(sessionId) {
    return prisma.trackEvent.count({ where: { sessionId } });
}
// ---------------------------------------------------------------------------
// Analytics queries
// ---------------------------------------------------------------------------
/** Returns ordered page_view events for a session — for flow reconstruction */
export async function getPageViewSequence(sessionId) {
    return prisma.trackEvent.findMany({
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
export async function getPageFlowGraph(siteUrl, since, limit = 20) {
    const events = await prisma.trackEvent.findMany({
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
export async function getFunnelStepCounts(siteUrl, steps, since) {
    const results = [];
    for (const step of steps) {
        const count = await prisma.trackEvent.findMany({
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
export async function getAvgTimeOnPage(siteUrl, since, pageType, limit = 20) {
    const events = await prisma.trackEvent.findMany({
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
export async function getAvgScrollDepth(siteUrl, since, pageType) {
    const events = await prisma.trackEvent.findMany({
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
export async function getClickCoordinates(siteUrl, since, pageUrl, limit = 2000) {
    const events = await prisma.trackEvent.findMany({
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