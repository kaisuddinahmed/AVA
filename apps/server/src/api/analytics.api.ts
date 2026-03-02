import type { Request, Response } from "express";
import { EvaluationRepo, InterventionRepo, EventRepo, SessionRepo } from "@ava/db";
import { prisma } from "@ava/db";

function parseSince(req: Request): Date | undefined {
  const s = req.query.since as string | undefined;
  return s ? new Date(s) : undefined;
}

function parseSiteUrl(req: Request): string | undefined {
  return req.query.siteUrl as string | undefined;
}

/**
 * Analytics API — Aggregated metrics for dashboard visualization.
 * Provides: friction breakdown, conversion funnel, intervention efficiency.
 */

/**
 * GET /api/analytics/session/:sessionId
 * Session-level analytics: MSWIM signal history, intervention outcomes.
 */
export async function getSessionAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = String(req.params.sessionId);

    const [evaluations, interventions, events] = await Promise.all([
      EvaluationRepo.getEvaluationsBySession(sessionId),
      InterventionRepo.getInterventionsBySession(sessionId),
      EventRepo.getEventsBySession(sessionId, { limit: 500 }),
    ]);

    // MSWIM signal timeline
    const signalTimeline = evaluations.map((e) => ({
      timestamp: e.timestamp,
      intent: e.intentScore,
      friction: e.frictionScore,
      clarity: e.clarityScore,
      receptivity: e.receptivityScore,
      value: e.valueScore,
      composite: e.compositeScore,
      tier: e.tier,
    }));

    // Intervention outcomes
    const outcomeBreakdown = {
      total: interventions.length,
      delivered: interventions.filter((i) => i.status === "delivered").length,
      dismissed: interventions.filter((i) => i.status === "dismissed").length,
      converted: interventions.filter((i) => i.status === "converted").length,
      ignored: interventions.filter((i) => i.status === "ignored").length,
    };

    // Friction IDs detected
    const frictionIds = events
      .filter((e) => e.frictionId)
      .map((e) => e.frictionId as string);
    const frictionBreakdown = frictionIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    // Event category breakdown
    const categoryBreakdown = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      sessionId,
      signalTimeline,
      outcomeBreakdown,
      frictionBreakdown,
      categoryBreakdown,
      totalEvents: events.length,
      totalEvaluations: evaluations.length,
    });
  } catch (error) {
    console.error("[Analytics] Session analytics error:", error);
    res.status(500).json({ error: "Failed to compute session analytics" });
  }
}

/**
 * GET /api/analytics/overview
 * Global overview: intervention efficiency, friction hotspots.
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    // Optional "since" filter — only count data created after this timestamp
    const sinceParam = req.query.since as string | undefined;
    const sinceDate = sinceParam ? new Date(sinceParam) : undefined;
    const sinceFilter = sinceDate ? { gte: sinceDate } : undefined;

    const sessionWhere = sinceFilter ? { startedAt: sinceFilter } : {};
    const activeSessionWhere = sinceFilter
      ? { status: "active" as const, startedAt: sinceFilter }
      : { status: "active" as const };

    const [allInterventions, allEvaluations, totalSessions, activeSessions, totalEvents] =
      await Promise.all([
        InterventionRepo.listInterventions({ limit: 1000, since: sinceDate }),
        EvaluationRepo.listEvaluations({ limit: 1000, since: sinceDate }),
        prisma.session.count({ where: sessionWhere }),
        prisma.session.count({ where: activeSessionWhere }),
        prisma.trackEvent.count({ where: sinceFilter ? { timestamp: sinceFilter } : {} }),
      ]);

    // Intervention efficiency
    const fired = allInterventions.length;
    const delivered = allInterventions.filter((i) => i.status === "delivered").length;
    const dismissed = allInterventions.filter((i) => i.status === "dismissed").length;
    const converted = allInterventions.filter((i) => i.status === "converted").length;
    const ignored = allInterventions.filter((i) => i.status === "ignored").length;
    const conversionRate = fired > 0 ? Math.round((converted / fired) * 10000) / 10000 : 0;
    const dismissalRate = fired > 0 ? Math.round((dismissed / fired) * 10000) / 10000 : 0;

    // Tier distribution
    const tierDistribution = allEvaluations.reduce<Record<string, number>>((acc, e) => {
      acc[e.tier] = (acc[e.tier] || 0) + 1;
      return acc;
    }, {});

    // Friction hotspots (top 10 most detected frictions)
    const frictionCounts: Record<string, { count: number; category: string }> = {};
    for (const eval_ of allEvaluations) {
      try {
        const frictions = JSON.parse(eval_.frictionsFound) as Array<
          string | { friction_id: string; category?: string }
        >;
        for (const f of frictions) {
          const fid = typeof f === "string" ? f : f.friction_id;
          const cat = typeof f === "string" ? "unknown" : (f.category ?? "unknown");
          if (!frictionCounts[fid]) frictionCounts[fid] = { count: 0, category: cat };
          frictionCounts[fid].count++;
        }
      } catch {
        // Skip malformed JSON
      }
    }
    const frictionHotspots = Object.entries(frictionCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([frictionId, { count, category }]) => ({ frictionId, count, category }));

    // Enriched analytics metrics
    const siteUrl = req.query.siteUrl as string | undefined;
    const [bounceData, avgDuration, avgPageViews] = await Promise.all([
      siteUrl ? SessionRepo.getBounceRate(siteUrl, sinceDate) : Promise.resolve({ total: 0, bounced: 0, bounceRate: 0 }),
      siteUrl ? SessionRepo.getAvgSessionDuration(siteUrl, sinceDate) : Promise.resolve(0),
      siteUrl ? SessionRepo.getAvgPageViews(siteUrl, sinceDate) : Promise.resolve(0),
    ]);

    res.json({
      totalSessions,
      activeSessions,
      totalEvents,
      totalEvaluations: allEvaluations.length,
      totalInterventions: fired,
      interventionEfficiency: {
        fired,
        delivered,
        dismissed,
        converted,
        ignored,
        conversionRate,
        dismissalRate,
      },
      tierDistribution,
      frictionHotspots,
      // New analytics fields
      bounceRate: bounceData.bounceRate,
      avgSessionDurationMs: avgDuration,
      avgPageViewsPerSession: avgPageViews,
    });
  } catch (error) {
    console.error("[Analytics] Overview error:", error);
    res.status(500).json({ error: "Failed to compute analytics overview" });
  }
}

/**
 * GET /api/analytics/funnel
 * Conversion funnel: sessions reaching each pageType step.
 */
export async function getFunnel(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const steps = ["landing", "category", "pdp", "cart", "checkout"];
    const counts = await EventRepo.getFunnelStepCounts(siteUrl, steps, since);
    const first = counts[0]?.sessionCount ?? 1;
    res.json({
      steps: counts.map(c => ({
        ...c,
        dropOffPct: first > 0 ? Math.round((1 - c.sessionCount / first) * 100) : 0,
        retentionPct: first > 0 ? Math.round((c.sessionCount / first) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error("[Analytics] Funnel error:", error);
    res.status(500).json({ error: "Failed to compute funnel" });
  }
}

/**
 * GET /api/analytics/flow
 * Top page-to-page navigation transitions.
 */
export async function getPageFlow(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const flows = await EventRepo.getPageFlowGraph(siteUrl, since, limit);
    res.json({ flows });
  } catch (error) {
    console.error("[Analytics] Flow error:", error);
    res.status(500).json({ error: "Failed to compute page flow" });
  }
}

/**
 * GET /api/analytics/traffic
 * Traffic source breakdown by referrerType.
 */
export async function getTrafficSources(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const breakdown = await SessionRepo.getTrafficSourceBreakdown(siteUrl, since);
    res.json({ breakdown });
  } catch (error) {
    console.error("[Analytics] Traffic sources error:", error);
    res.status(500).json({ error: "Failed to compute traffic sources" });
  }
}

/**
 * GET /api/analytics/devices
 * Device type breakdown.
 */
export async function getDevices(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const breakdown = await SessionRepo.getDeviceBreakdown(siteUrl, since);
    res.json({ breakdown });
  } catch (error) {
    console.error("[Analytics] Devices error:", error);
    res.status(500).json({ error: "Failed to compute device breakdown" });
  }
}

/**
 * GET /api/analytics/pages
 * Per-page avg time on page and avg scroll depth.
 */
export async function getPageStats(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const [pages, scrollDepths] = await Promise.all([
      EventRepo.getAvgTimeOnPage(siteUrl, since, undefined, limit),
      EventRepo.getAvgScrollDepth(siteUrl, since),
    ]);
    // Merge scroll depth into pages by pageType
    const scrollByType = new Map(scrollDepths.map(s => [s.pageType, s.avgScrollDepthPct]));
    const pagesWithScroll = pages.map(p => ({
      ...p,
      avgScrollDepthPct: scrollByType.get(p.pageType) ?? null,
    }));
    res.json({ pages: pagesWithScroll });
  } catch (error) {
    console.error("[Analytics] Page stats error:", error);
    res.status(500).json({ error: "Failed to compute page stats" });
  }
}

/**
 * GET /api/analytics/sessions/trend
 * Daily session volume over a time range.
 */
export async function getSessionsTrend(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const until = req.query.until ? new Date(req.query.until as string) : undefined;
    const trend = await SessionRepo.getSessionVolumeByDay(siteUrl, since, until);
    res.json({ trend });
  } catch (error) {
    console.error("[Analytics] Sessions trend error:", error);
    res.status(500).json({ error: "Failed to compute sessions trend" });
  }
}

/**
 * GET /api/analytics/retention
 * Weekly retention cohort: new vs returning sessions by week.
 */
export async function getRetention(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const until = req.query.until ? new Date(req.query.until as string) : undefined;
    const cohorts = await SessionRepo.getRetentionCohort(siteUrl, since, until);
    res.json({ cohorts });
  } catch (error) {
    console.error("[Analytics] Retention error:", error);
    res.status(500).json({ error: "Failed to compute retention" });
  }
}

/**
 * GET /api/analytics/clicks
 * Click coordinate data for heatmap rendering.
 */
export async function getClickHeatmap(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) { res.status(400).json({ error: "siteUrl required" }); return; }
    const since = parseSince(req);
    const pageUrl = req.query.pageUrl as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 2000;
    const points = await EventRepo.getClickCoordinates(siteUrl, since, pageUrl, limit);
    res.json({ points });
  } catch (error) {
    console.error("[Analytics] Click heatmap error:", error);
    res.status(500).json({ error: "Failed to get click heatmap data" });
  }
}
