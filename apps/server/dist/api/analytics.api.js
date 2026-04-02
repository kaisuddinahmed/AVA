import { EvaluationRepo, InterventionRepo, EventRepo, SessionRepo } from "@ava/db";
import { prisma } from "@ava/db";
import { SEVERITY_SCORES } from "@ava/shared";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
function parseSinceValue(value) {
    if (typeof value !== "string" || value.trim() === "")
        return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
function parseSince(req) {
    return parseSinceValue(req.query.since);
}
function parseSiteUrl(req) {
    return req.query.siteUrl;
}
/**
 * Analytics API — Aggregated metrics for dashboard visualization.
 * Provides: friction breakdown, conversion funnel, intervention efficiency.
 */
/**
 * GET /api/analytics/session/:sessionId
 * Session-level analytics: MSWIM signal history, intervention outcomes.
 */
export async function getSessionAnalytics(req, res) {
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
            .map((e) => e.frictionId);
        const frictionBreakdown = frictionIds.reduce((acc, id) => {
            acc[id] = (acc[id] || 0) + 1;
            return acc;
        }, {});
        // Event category breakdown
        const categoryBreakdown = events.reduce((acc, e) => {
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
    }
    catch (error) {
        log.error("[Analytics] Session analytics error:", error);
        res.status(500).json({ error: "Failed to compute session analytics" });
    }
}
/**
 * GET /api/analytics/overview
 * Global overview: intervention efficiency, friction hotspots.
 */
export async function getOverview(req, res) {
    try {
        // Optional "since" filter — only count data created after this timestamp
        const sinceDate = parseSince(req);
        const sinceFilter = sinceDate ? { gte: sinceDate } : undefined;
        const siteUrl = parseSiteUrl(req);
        const sessionWhere = {
            ...(sinceFilter ? { startedAt: sinceFilter } : {}),
            ...(siteUrl ? { siteUrl } : {}),
        };
        const activeSessionWhere = {
            status: "active",
            ...(sinceFilter ? { startedAt: sinceFilter } : {}),
            ...(siteUrl ? { siteUrl } : {}),
        };
        const eventWhere = {
            ...(sinceFilter ? { timestamp: sinceFilter } : {}),
            ...(siteUrl ? { siteUrl } : {}),
        };
        const evaluationsPromise = siteUrl
            ? EvaluationRepo.getEvaluationsBySite(siteUrl, 1000).then((rows) => sinceDate ? rows.filter((e) => e.timestamp >= sinceDate) : rows)
            : EvaluationRepo.listEvaluations({ limit: 1000, since: sinceDate });
        const [allInterventions, allEvaluations, totalSessions, activeSessions, totalEvents] = await Promise.all([
            InterventionRepo.listInterventions({ limit: 1000, since: sinceDate, siteUrl }),
            evaluationsPromise,
            prisma.session.count({ where: sessionWhere }),
            prisma.session.count({ where: activeSessionWhere }),
            prisma.trackEvent.count({ where: eventWhere }),
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
        const tierDistribution = allEvaluations.reduce((acc, e) => {
            acc[e.tier] = (acc[e.tier] || 0) + 1;
            return acc;
        }, {});
        // Friction hotspots (top 10 most detected frictions)
        const frictionCounts = {};
        for (const eval_ of allEvaluations) {
            try {
                const frictions = JSON.parse(eval_.frictionsFound);
                for (const f of frictions) {
                    const fid = typeof f === "string" ? f : f.friction_id;
                    const cat = typeof f === "string" ? "unknown" : (f.category ?? "unknown");
                    if (!frictionCounts[fid])
                        frictionCounts[fid] = { count: 0, category: cat };
                    frictionCounts[fid].count++;
                }
            }
            catch {
                // Skip malformed JSON
            }
        }
        const frictionHotspots = Object.entries(frictionCounts)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 10)
            .map(([frictionId, { count, category }]) => ({ frictionId, count, category }));
        // Enriched analytics metrics
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
    }
    catch (error) {
        log.error("[Analytics] Overview error:", error);
        res.status(500).json({ error: "Failed to compute analytics overview" });
    }
}
/**
 * GET /api/analytics/funnel
 * Conversion funnel: sessions reaching each pageType step.
 */
export async function getFunnel(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
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
    }
    catch (error) {
        log.error("[Analytics] Funnel error:", error);
        res.status(500).json({ error: "Failed to compute funnel" });
    }
}
/**
 * GET /api/analytics/flow
 * Top page-to-page navigation transitions.
 */
export async function getPageFlow(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const flows = await EventRepo.getPageFlowGraph(siteUrl, since, limit);
        res.json({ flows });
    }
    catch (error) {
        log.error("[Analytics] Flow error:", error);
        res.status(500).json({ error: "Failed to compute page flow" });
    }
}
/**
 * GET /api/analytics/traffic
 * Traffic source breakdown by referrerType.
 */
export async function getTrafficSources(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const breakdown = await SessionRepo.getTrafficSourceBreakdown(siteUrl, since);
        res.json({ breakdown });
    }
    catch (error) {
        log.error("[Analytics] Traffic sources error:", error);
        res.status(500).json({ error: "Failed to compute traffic sources" });
    }
}
/**
 * GET /api/analytics/devices
 * Device type breakdown.
 */
export async function getDevices(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const breakdown = await SessionRepo.getDeviceBreakdown(siteUrl, since);
        res.json({ breakdown });
    }
    catch (error) {
        log.error("[Analytics] Devices error:", error);
        res.status(500).json({ error: "Failed to compute device breakdown" });
    }
}
/**
 * GET /api/analytics/pages
 * Per-page avg time on page and avg scroll depth.
 */
export async function getPageStats(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
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
    }
    catch (error) {
        log.error("[Analytics] Page stats error:", error);
        res.status(500).json({ error: "Failed to compute page stats" });
    }
}
/**
 * GET /api/analytics/sessions/trend
 * Daily session volume over a time range.
 */
export async function getSessionsTrend(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const until = req.query.until ? new Date(req.query.until) : undefined;
        const trend = await SessionRepo.getSessionVolumeByDay(siteUrl, since, until);
        res.json({ trend });
    }
    catch (error) {
        log.error("[Analytics] Sessions trend error:", error);
        res.status(500).json({ error: "Failed to compute sessions trend" });
    }
}
/**
 * GET /api/analytics/retention
 * Weekly retention cohort: new vs returning sessions by week.
 */
export async function getRetention(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const until = req.query.until ? new Date(req.query.until) : undefined;
        const cohorts = await SessionRepo.getRetentionCohort(siteUrl, since, until);
        res.json({ cohorts });
    }
    catch (error) {
        log.error("[Analytics] Retention error:", error);
        res.status(500).json({ error: "Failed to compute retention" });
    }
}
/**
 * GET /api/analytics/voice
 * Voice intervention performance: conversion/dismissal rates vs text, mute rate.
 */
export async function getVoiceAnalytics(req, res) {
    try {
        const sinceDate = parseSince(req);
        const sinceFilter = sinceDate ? { gte: sinceDate } : undefined;
        const siteUrl = parseSiteUrl(req);
        // Session-level where clause (for voiceMuted / totalVoiceInterventionsFired counts)
        const sessionWhere = {};
        if (sinceFilter)
            sessionWhere.startedAt = sinceFilter;
        if (siteUrl)
            sessionWhere.siteUrl = siteUrl;
        const [allInterventions, mutedSessions, voiceActiveSessions] = await Promise.all([
            InterventionRepo.listInterventions({ limit: 5000, since: sinceDate, siteUrl }),
            prisma.session.count({ where: { ...sessionWhere, voiceMuted: true } }),
            prisma.session.count({ where: { ...sessionWhere, totalVoiceInterventionsFired: { gt: 0 } } }),
        ]);
        // Partition interventions into three buckets:
        //   voice  — voice_enabled: true (nudge/active/escalate with TTS)
        //   text   — non-voice, non-passive (nudge/active/escalate text-only)
        //   passive — excluded from comparison (passive always has voice_enabled: false
        //             and converts on page actions, not on AVA interaction)
        let voiceFired = 0, voiceConverted = 0, voiceDismissed = 0, voiceIgnored = 0;
        let textFired = 0, textConverted = 0, textDismissed = 0, textIgnored = 0;
        for (const iv of allInterventions) {
            // Skip passive interventions — they are never voice-enabled and have
            // fundamentally different conversion semantics (page action, not AVA CTA).
            if (iv.type === "passive")
                continue;
            let isVoice = false;
            try {
                const p = JSON.parse(iv.payload);
                isVoice = p.voice_enabled === true;
            }
            catch {
                // ignore malformed JSON
            }
            if (isVoice) {
                voiceFired++;
                if (iv.status === "converted")
                    voiceConverted++;
                else if (iv.status === "dismissed")
                    voiceDismissed++;
                else if (iv.status === "ignored")
                    voiceIgnored++;
            }
            else {
                textFired++;
                if (iv.status === "converted")
                    textConverted++;
                else if (iv.status === "dismissed")
                    textDismissed++;
                else if (iv.status === "ignored")
                    textIgnored++;
            }
        }
        const voiceConversionRate = voiceFired > 0 ? Math.round((voiceConverted / voiceFired) * 10000) / 10000 : 0;
        const voiceDismissalRate = voiceFired > 0 ? Math.round((voiceDismissed / voiceFired) * 10000) / 10000 : 0;
        const textConversionRate = textFired > 0 ? Math.round((textConverted / textFired) * 10000) / 10000 : 0;
        const textDismissalRate = textFired > 0 ? Math.round((textDismissed / textFired) * 10000) / 10000 : 0;
        const muteRate = voiceActiveSessions > 0
            ? Math.round((mutedSessions / voiceActiveSessions) * 10000) / 10000
            : 0;
        res.json({
            voice: {
                fired: voiceFired,
                converted: voiceConverted,
                dismissed: voiceDismissed,
                ignored: voiceIgnored,
                conversionRate: voiceConversionRate,
                dismissalRate: voiceDismissalRate,
            },
            text: {
                fired: textFired,
                converted: textConverted,
                dismissed: textDismissed,
                ignored: textIgnored,
                conversionRate: textConversionRate,
                dismissalRate: textDismissalRate,
            },
            sessions: {
                voiceActive: voiceActiveSessions,
                muted: mutedSessions,
                muteRate,
            },
        });
    }
    catch (error) {
        log.error("[Analytics] Voice analytics error:", error);
        res.status(500).json({ error: "Failed to compute voice analytics" });
    }
}
/**
 * GET /api/analytics/friction
 * Per-frictionId breakdown + 30-day trend + severity distribution.
 */
export async function getFrictionAnalytics(req, res) {
    try {
        const sinceDate = parseSince(req);
        const siteUrl = parseSiteUrl(req);
        // Use 30 days for trend regardless of since param
        const trendSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [allInterventions, allEvaluations] = await Promise.all([
            InterventionRepo.listInterventions({ limit: 5000, since: sinceDate, siteUrl }),
            siteUrl
                ? EvaluationRepo.getEvaluationsBySite(siteUrl, 5000).then((rows) => sinceDate ? rows.filter((e) => e.timestamp >= sinceDate) : rows)
                : EvaluationRepo.listEvaluations({ limit: 5000, since: sinceDate }),
        ]);
        // Aggregate friction detections from evaluation records
        const frictionMeta = {};
        // Daily trend: { "YYYY-MM-DD": { [frictionId]: count } }
        const trendMap = {};
        for (const ev of allEvaluations) {
            let frictions = [];
            try {
                frictions = JSON.parse(ev.frictionsFound);
            }
            catch {
                continue;
            }
            const dayKey = new Date(ev.timestamp).toISOString().slice(0, 10);
            for (const f of frictions) {
                const fid = typeof f === "string" ? f : f.friction_id;
                const cat = typeof f === "string" ? "unknown" : (f.category ?? "unknown");
                if (!frictionMeta[fid])
                    frictionMeta[fid] = { count: 0, category: cat, mswimScores: [] };
                frictionMeta[fid].count++;
                if (ev.compositeScore != null)
                    frictionMeta[fid].mswimScores.push(ev.compositeScore);
                // Trend (30-day window only)
                if (new Date(ev.timestamp) >= trendSince) {
                    if (!trendMap[dayKey])
                        trendMap[dayKey] = {};
                    trendMap[dayKey][fid] = (trendMap[dayKey][fid] ?? 0) + 1;
                }
            }
        }
        // Aggregate interventions by frictionId
        const ivStats = {};
        for (const iv of allInterventions) {
            if (iv.type === "passive")
                continue;
            const fid = iv.frictionId;
            if (!ivStats[fid])
                ivStats[fid] = { fired: 0, converted: 0, dismissed: 0 };
            ivStats[fid].fired++;
            if (iv.status === "converted")
                ivStats[fid].converted++;
            else if (iv.status === "dismissed")
                ivStats[fid].dismissed++;
        }
        // Build by-friction rows
        const allFrictionIds = new Set([...Object.keys(frictionMeta), ...Object.keys(ivStats)]);
        const byFriction = Array.from(allFrictionIds)
            .map((fid) => {
            const meta = frictionMeta[fid];
            const iv = ivStats[fid];
            const fired = iv?.fired ?? 0;
            const converted = iv?.converted ?? 0;
            const resolutionRate = fired > 0 ? Math.round((converted / fired) * 10000) / 10000 : 0;
            const scores = meta?.mswimScores ?? [];
            const avgMswim = scores.length > 0
                ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                : null;
            const severity = SEVERITY_SCORES[fid] ?? 50;
            return {
                frictionId: fid,
                category: meta?.category ?? "unknown",
                severity,
                detections: meta?.count ?? 0,
                interventionsFired: fired,
                conversions: converted,
                dismissals: iv?.dismissed ?? 0,
                resolutionRate,
                avgMswimAtDetection: avgMswim,
            };
        })
            .sort((a, b) => b.detections - a.detections)
            .slice(0, 50);
        // Top 5 frictions for trend chart
        const top5Ids = byFriction.slice(0, 5).map((r) => r.frictionId);
        // Build 30-day trend: array of { date, [frictionId]: count }
        const days = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            days.push(d.toISOString().slice(0, 10));
        }
        const trend = days.map((date) => {
            const row = { date };
            for (const fid of top5Ids) {
                row[fid] = trendMap[date]?.[fid] ?? 0;
            }
            return row;
        });
        // Severity distribution: low (0–39), medium (40–59), high (60–79), critical (80+)
        const severityDist = { low: 0, medium: 0, high: 0, critical: 0 };
        for (const row of byFriction) {
            const count = row.detections;
            const sev = row.severity;
            if (sev < 40)
                severityDist.low += count;
            else if (sev < 60)
                severityDist.medium += count;
            else if (sev < 80)
                severityDist.high += count;
            else
                severityDist.critical += count;
        }
        res.json({ byFriction, trend, top5Ids, severityDistribution: severityDist });
    }
    catch (error) {
        log.error("[Analytics] Friction analytics error:", error);
        res.status(500).json({ error: "Failed to compute friction analytics" });
    }
}
/**
 * GET /api/analytics/revenue
 * Revenue attribution: per-frictionId cart lift from converted interventions.
 */
export async function getRevenueAttribution(req, res) {
    try {
        const sinceDate = parseSince(req);
        const siteUrl = parseSiteUrl(req);
        const allInterventions = await InterventionRepo.listInterventions({ limit: 5000, since: sinceDate, siteUrl });
        // Only converted, non-passive interventions with cartValueAtFire recorded
        const converted = allInterventions.filter((iv) => iv.status === "converted" &&
            iv.type !== "passive" &&
            iv.cartValueAtFire != null);
        // Fetch current cart values for sessions that converted
        const sessionIds = [...new Set(converted.map((iv) => iv.sessionId))];
        const sessionValues = {};
        if (sessionIds.length > 0) {
            const sessions = await prisma.session.findMany({
                where: { id: { in: sessionIds } },
                select: { id: true, cartValue: true },
            });
            for (const s of sessions)
                sessionValues[s.id] = s.cartValue;
        }
        const byFrictionMap = {};
        let totalAttributedRevenue = 0;
        for (const iv of converted) {
            const cartAtFire = iv.cartValueAtFire;
            const cartNow = sessionValues[iv.sessionId] ?? cartAtFire;
            const lift = Math.max(0, cartNow - cartAtFire);
            totalAttributedRevenue += lift;
            if (!byFrictionMap[iv.frictionId])
                byFrictionMap[iv.frictionId] = { conversions: 0, totalLift: 0 };
            byFrictionMap[iv.frictionId].conversions++;
            byFrictionMap[iv.frictionId].totalLift += lift;
        }
        const byFriction = Object.entries(byFrictionMap)
            .map(([frictionId, r]) => ({
            frictionId,
            conversions: r.conversions,
            totalLift: Math.round(r.totalLift * 100) / 100,
            avgLift: r.conversions > 0 ? Math.round((r.totalLift / r.conversions) * 100) / 100 : 0,
        }))
            .sort((a, b) => b.totalLift - a.totalLift);
        // Control group session count — used for conversionLiftVsControl display
        const controlGroupSessions = siteUrl
            ? await prisma.session.count({ where: { siteUrl, isControlSession: true } })
            : 0;
        res.json({
            totalAttributedRevenue: Math.round(totalAttributedRevenue * 100) / 100,
            totalConvertedInterventions: converted.length,
            avgLiftPerConversion: converted.length > 0
                ? Math.round((totalAttributedRevenue / converted.length) * 100) / 100
                : 0,
            controlGroupSessions,
            byFriction,
        });
    }
    catch (error) {
        log.error("[Analytics] Revenue attribution error:", error);
        res.status(500).json({ error: "Failed to compute revenue attribution" });
    }
}
/**
 * GET /api/analytics/clicks
 * Click coordinate data for heatmap rendering.
 */
export async function getClickHeatmap(req, res) {
    try {
        const siteUrl = parseSiteUrl(req);
        if (!siteUrl) {
            res.status(400).json({ error: "siteUrl required" });
            return;
        }
        const since = parseSince(req);
        const pageUrl = req.query.pageUrl;
        const limit = req.query.limit ? Number(req.query.limit) : 2000;
        const points = await EventRepo.getClickCoordinates(siteUrl, since, pageUrl, limit);
        res.json({ points });
    }
    catch (error) {
        log.error("[Analytics] Click heatmap error:", error);
        res.status(500).json({ error: "Failed to get click heatmap data" });
    }
}
//# sourceMappingURL=analytics.api.js.map