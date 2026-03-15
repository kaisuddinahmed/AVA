// ============================================================================
// Insights Service — weekly merchant digest + AI-generated recommendations
//
// Generates an InsightSnapshot for a given site by:
//   1. Aggregating last-7d session + friction + intervention data
//   2. Calling Groq LLM for 5 plain-language fix suggestions
//   3. Persisting to InsightSnapshot for the dashboard to read
// ============================================================================

import Groq from "groq-sdk";
import { InsightSnapshotRepo, EventRepo, InterventionRepo, SessionRepo } from "@ava/db";
import { prisma } from "@ava/db";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsightRecommendation {
  frictionId: string;
  page: string;
  impactEstimate: string;   // e.g. "~12 sessions/week"
  fixText: string;          // 2-sentence max from LLM
  confidence: "high" | "medium" | "low";
  sampleSize: number;
}

export interface InsightDigest {
  siteUrl: string;
  periodStart: Date;
  periodEnd: Date;
  sessionsAnalyzed: number;
  frictionsCaught: number;
  attributedRevenue: number;
  topFrictionTypes: string[];
  wowDeltaPct: number | null;
  recommendations: InsightRecommendation[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Generate (or refresh) the insight snapshot for a site.
 * Safe to call from nightly batch — idempotent within same calendar day.
 */
export async function generateInsightSnapshot(siteUrl: string): Promise<InsightDigest> {
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── 1. Aggregate this week ───────────────────────────────────────────────
  const [sessions, frictionEvents, interventions] = await Promise.all([
    prisma.session.findMany({
      where: { siteUrl, startedAt: { gte: periodStart } },
      select: { id: true, startedAt: true, totalConversions: true },
    }),
    prisma.trackEvent.findMany({
      where: { siteUrl, timestamp: { gte: periodStart }, frictionId: { not: null } },
      select: { frictionId: true, pageUrl: true },
    }),
    prisma.intervention.findMany({
      where: {
        session: { siteUrl },
        timestamp: { gte: periodStart },
        status: "converted",
        cartValueAtFire: { not: null },
      },
      select: { cartValueAtFire: true, cartValueAtConversion: true, frictionId: true },
    }),
  ]);

  const sessionsAnalyzed = sessions.length;
  const frictionsCaught = frictionEvents.length;

  // Revenue attributed: sum of cart lift on converted interventions
  const attributedRevenue = interventions.reduce((sum, i) => {
    const atConv = i.cartValueAtConversion ?? i.cartValueAtFire ?? 0;
    const atFire = i.cartValueAtFire ?? 0;
    return sum + Math.max(0, atConv - atFire);
  }, 0);

  // Top friction types by frequency
  const frictionCounts: Record<string, number> = {};
  for (const e of frictionEvents) {
    if (e.frictionId) frictionCounts[e.frictionId] = (frictionCounts[e.frictionId] ?? 0) + 1;
  }
  const topFrictionTypes = Object.entries(frictionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  // WoW delta
  const prevSessions = await prisma.session.count({
    where: { siteUrl, startedAt: { gte: prevPeriodStart, lt: periodStart } },
  });
  const wowDeltaPct = prevSessions > 0
    ? ((sessionsAnalyzed - prevSessions) / prevSessions) * 100
    : null;

  // ── 2. Build per-friction context for LLM ───────────────────────────────
  interface FrictionCtx {
    frictionId: string;
    page: string;
    eventCount: number;
    interventionFired: number;
    conversions: number;
  }

  const frictionCtxMap: Record<string, FrictionCtx> = {};
  for (const e of frictionEvents) {
    const fid = e.frictionId!;
    const page = e.pageUrl ? new URL(e.pageUrl).pathname.slice(0, 60) : "/unknown";
    if (!frictionCtxMap[fid]) {
      frictionCtxMap[fid] = { frictionId: fid, page, eventCount: 0, interventionFired: 0, conversions: 0 };
    }
    frictionCtxMap[fid].eventCount++;
  }
  for (const i of interventions) {
    const ctx = frictionCtxMap[i.frictionId];
    if (ctx) {
      ctx.interventionFired++;
      ctx.conversions++;
    }
  }

  const topFrictionCtx = Object.values(frictionCtxMap)
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 5);

  // ── 3. Call Groq for recommendations ────────────────────────────────────
  const recommendations = await generateRecommendations(topFrictionCtx, sessionsAnalyzed);

  // ── 4. Persist ──────────────────────────────────────────────────────────
  await InsightSnapshotRepo.createInsightSnapshot({
    siteUrl,
    periodStart,
    periodEnd,
    sessionsAnalyzed,
    frictionsCaught,
    attributedRevenue,
    topFrictionTypes: JSON.stringify(topFrictionTypes),
    wowDeltaPct: wowDeltaPct ?? undefined,
    recommendations: JSON.stringify(recommendations),
  });

  return {
    siteUrl,
    periodStart,
    periodEnd,
    sessionsAnalyzed,
    frictionsCaught,
    attributedRevenue,
    topFrictionTypes,
    wowDeltaPct,
    recommendations,
  };
}

async function generateRecommendations(
  frictionCtx: Array<{ frictionId: string; page: string; eventCount: number; interventionFired: number; conversions: number }>,
  totalSessions: number,
): Promise<InsightRecommendation[]> {
  if (frictionCtx.length === 0 || !config.groq.apiKey) {
    return frictionCtx.slice(0, 5).map((f) => ({
      frictionId: f.frictionId,
      page: f.page,
      impactEstimate: `~${f.eventCount} events/week`,
      fixText: `Investigate ${f.frictionId} on ${f.page}. ${f.eventCount} occurrences detected.`,
      confidence: (f.eventCount >= 100 ? "high" : f.eventCount >= 20 ? "medium" : "low") as "high" | "medium" | "low",
      sampleSize: f.eventCount,
    }));
  }

  const groq = new Groq({ apiKey: config.groq.apiKey });

  const frictionSummary = frictionCtx.map((f) =>
    `- ${f.frictionId} on ${f.page}: ${f.eventCount} detections, ${f.conversions} conversions after AVA intervened`
  ).join("\n");

  const prompt = `You are an ecommerce CRO analyst. A site had ${totalSessions} sessions this week with these friction points:\n\n${frictionSummary}\n\nFor each friction, provide a 2-sentence actionable fix suggestion. Respond with a JSON array of objects with keys: frictionId, fixText. Be direct and specific.`;

  try {
    const resp = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        { role: "system", content: "You are a concise ecommerce CRO expert. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const fixes: Array<{ frictionId: string; fixText: string }> = Array.isArray(parsed)
      ? parsed
      : (parsed.recommendations ?? parsed.fixes ?? []);

    return frictionCtx.slice(0, 5).map((f) => {
      const fix = fixes.find((x) => x.frictionId === f.frictionId);
      return {
        frictionId: f.frictionId,
        page: f.page,
        impactEstimate: `~${f.eventCount} events/week`,
        fixText: fix?.fixText ?? `Address ${f.frictionId} friction on ${f.page}.`,
        confidence: (f.eventCount >= 100 ? "high" : f.eventCount >= 20 ? "medium" : "low") as "high" | "medium" | "low",
        sampleSize: f.eventCount,
      };
    });
  } catch {
    return frictionCtx.slice(0, 5).map((f) => ({
      frictionId: f.frictionId,
      page: f.page,
      impactEstimate: `~${f.eventCount} events/week`,
      fixText: `Address ${f.frictionId} friction on ${f.page}. ${f.eventCount} occurrences detected this week.`,
      confidence: (f.eventCount >= 100 ? "high" : f.eventCount >= 20 ? "medium" : "low") as "high" | "medium" | "low",
      sampleSize: f.eventCount,
    }));
  }
}
