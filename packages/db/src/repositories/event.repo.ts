// ============================================================================
// Event Repository — TrackEvent persistence & queries
// ============================================================================

import { prisma } from "../client.js";

export type CreateEventInput = {
  sessionId: string;
  category: string;
  eventType: string;
  frictionId?: string;
  pageType: string;
  pageUrl: string;
  rawSignals: string; // JSON blob
  metadata?: string;
  // Analytics fields
  previousPageUrl?: string;
  timeOnPageMs?: number;
  scrollDepthPct?: number;
  sessionSequenceNumber?: number;
  siteUrl?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createEvent(data: CreateEventInput) {
  return prisma.trackEvent.create({ data });
}

export async function createEventBatch(events: CreateEventInput[]) {
  return (prisma as any).trackEvent.createMany({ data: events });
}

export async function getEvent(id: string) {
  return prisma.trackEvent.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getEventsBySession(
  sessionId: string,
  options?: { since?: Date; limit?: number }
) {
  return prisma.trackEvent.findMany({
    where: {
      sessionId,
      ...(options?.since ? { timestamp: { gte: options.since } } : {}),
    },
    orderBy: { timestamp: "asc" },
    take: options?.limit,
  });
}

export async function getRecentEvents(
  sessionId: string,
  count: number = 10
) {
  return prisma.trackEvent.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    take: count,
  });
}

export async function getEventsByIds(ids: string[]) {
  return prisma.trackEvent.findMany({
    where: { id: { in: ids } },
    orderBy: { timestamp: "asc" },
  });
}

export async function getEventsByFriction(frictionId: string) {
  return prisma.trackEvent.findMany({
    where: { frictionId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
}

export async function getUnevaluatedEvents(
  sessionId: string,
  evaluatedEventIds: string[]
) {
  return prisma.trackEvent.findMany({
    where: {
      sessionId,
      id: { notIn: evaluatedEventIds },
    },
    orderBy: { timestamp: "asc" },
  });
}

export async function countEventsBySession(sessionId: string) {
  return prisma.trackEvent.count({ where: { sessionId } });
}

// ---------------------------------------------------------------------------
// Analytics queries
// ---------------------------------------------------------------------------

/** Returns ordered page_view events for a session — for flow reconstruction */
export async function getPageViewSequence(sessionId: string) {
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
export async function getPageFlowGraph(
  siteUrl: string,
  since?: Date,
  limit = 20
) {
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
  const counts = new Map<string, { from: string; to: string; count: number }>();
  for (const e of events) {
    const key = `${e.previousPageUrl}→${e.pageUrl}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { from: e.previousPageUrl!, to: e.pageUrl, count: 1 });
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
export async function getFunnelStepCounts(
  siteUrl: string,
  steps: string[],
  since?: Date
) {
  const results: Array<{ step: string; sessionCount: number }> = [];

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
export async function getAvgTimeOnPage(
  siteUrl: string,
  since?: Date,
  pageType?: string,
  limit = 20
) {
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

  const groups = new Map<string, { pageUrl: string; pageType: string; total: number; count: number }>();
  for (const e of events) {
    const existing = groups.get(e.pageUrl);
    if (existing) {
      existing.total += e.timeOnPageMs!;
      existing.count++;
    } else {
      groups.set(e.pageUrl, { pageUrl: e.pageUrl, pageType: e.pageType, total: e.timeOnPageMs!, count: 1 });
    }
  }

  return [...groups.values()]
    .map(g => ({ pageUrl: g.pageUrl, pageType: g.pageType, avgTimeOnPageMs: Math.round(g.total / g.count), views: g.count }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/** Average scroll depth grouped by pageType */
export async function getAvgScrollDepth(
  siteUrl: string,
  since?: Date,
  pageType?: string
) {
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

  const groups = new Map<string, { total: number; count: number }>();
  for (const e of events) {
    const key = e.pageType;
    const existing = groups.get(key);
    if (existing) {
      existing.total += e.scrollDepthPct!;
      existing.count++;
    } else {
      groups.set(key, { total: e.scrollDepthPct!, count: 1 });
    }
  }

  return [...groups.entries()].map(([pt, g]) => ({
    pageType: pt,
    avgScrollDepthPct: Math.round(g.total / g.count),
    sampleCount: g.count,
  }));
}

/** Returns click events with coordinates for heatmap rendering */
export async function getClickCoordinates(
  siteUrl: string,
  since?: Date,
  pageUrl?: string,
  limit = 2000
) {
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

  const points: Array<{ xPct: number; yPct: number; pageUrl: string }> = [];
  for (const e of events) {
    try {
      const signals = JSON.parse(e.rawSignals) as Record<string, unknown>;
      if (signals.x_pct !== undefined && signals.y_pct !== undefined) {
        points.push({
          xPct: Number(signals.x_pct),
          yPct: Number(signals.y_pct),
          pageUrl: e.pageUrl,
        });
      }
    } catch {
      // skip unparseable
    }
  }
  return points;
}
