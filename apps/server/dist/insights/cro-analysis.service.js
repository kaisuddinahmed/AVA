// ============================================================================
// CRO Analysis Service — per-page structural friction analysis
//
// Runs weekly (from nightly batch) to identify high-impact friction
// concentrations by page. Results stored in InsightSnapshot.croFindings.
// ============================================================================
import Groq from "groq-sdk";
import { InsightSnapshotRepo } from "@ava/db";
import { prisma } from "@ava/db";
import { config } from "../config.js";
import { getSeverity } from "@ava/shared";
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/**
 * Run CRO analysis for a site and attach findings to the latest InsightSnapshot.
 * If no snapshot exists for today, creates a minimal one.
 */
export async function runCROAnalysis(siteUrl) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days
    // ── 1. Aggregate friction events per (frictionId, pageUrl) ──────────────
    const frictionEvents = await prisma.trackEvent.findMany({
        where: { siteUrl, timestamp: { gte: since }, frictionId: { not: null } },
        select: { frictionId: true, pageUrl: true, sessionId: true },
    });
    const groups = new Map();
    for (const e of frictionEvents) {
        if (!e.frictionId)
            continue;
        const page = e.pageUrl ? new URL(e.pageUrl).pathname.slice(0, 80) : "/unknown";
        const key = `${e.frictionId}||${page}`;
        if (!groups.has(key)) {
            groups.set(key, { frictionId: e.frictionId, page, sessions: new Set(), count: 0 });
        }
        const g = groups.get(key);
        g.count++;
        g.sessions.add(e.sessionId);
    }
    // Sort by event count, take top 10
    const top = Array.from(groups.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    if (top.length === 0)
        return [];
    // ── 2. Call Groq for suggestions ─────────────────────────────────────────
    const suggestions = await generateCROSuggestions(top, siteUrl);
    const findings = top.map((g, idx) => ({
        frictionId: g.frictionId,
        page: g.page,
        eventCount: g.count,
        avgSeverity: getSeverity(g.frictionId),
        sessionsImpacted: g.sessions.size,
        suggestion: suggestions[idx] ?? `Investigate ${g.frictionId} on ${g.page}.`,
    }));
    // ── 3. Attach to latest snapshot (or upsert today's) ────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await prisma.insightSnapshot.findFirst({
        where: { siteUrl, createdAt: { gte: todayStart } },
        orderBy: { createdAt: "desc" },
    });
    const croJson = JSON.stringify(findings);
    if (existing) {
        await prisma.insightSnapshot.update({
            where: { id: String(existing.id) },
            data: { croFindings: croJson },
        });
    }
    else {
        const periodEnd = new Date();
        const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
        await InsightSnapshotRepo.createInsightSnapshot({
            siteUrl,
            periodStart,
            periodEnd,
            sessionsAnalyzed: 0,
            frictionsCaught: frictionEvents.length,
            attributedRevenue: 0,
            topFrictionTypes: JSON.stringify(findings.slice(0, 3).map((f) => f.frictionId)),
            recommendations: JSON.stringify([]),
            croFindings: croJson,
        });
    }
    return findings;
}
async function generateCROSuggestions(items, siteUrl) {
    if (!config.groq.apiKey) {
        return items.map((g) => `Fix ${g.frictionId} on ${g.page} — ${g.count} occurrences across ${g.sessions.size} sessions.`);
    }
    const groq = new Groq({ apiKey: config.groq.apiKey });
    const list = items.map((g, i) => `${i + 1}. ${g.frictionId} on ${g.page}: ${g.count} events in ${g.sessions.size} sessions`).join("\n");
    const prompt = `You are a CRO specialist auditing ${siteUrl}. These are the top structural friction issues on this site over the last 30 days:\n\n${list}\n\nFor each item, write one sentence of actionable site-change advice. Respond with a JSON array of strings, one per item.`;
    try {
        const resp = await groq.chat.completions.create({
            model: config.groq.model,
            messages: [
                { role: "system", content: "You are a concise ecommerce CRO specialist. Respond only with a JSON array of strings." },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: "json_object" },
        });
        const raw = resp.choices[0]?.message?.content ?? "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : (parsed.suggestions ?? parsed.items ?? []);
    }
    catch {
        return items.map((g) => `Investigate and fix ${g.frictionId} friction on ${g.page}.`);
    }
}
//# sourceMappingURL=cro-analysis.service.js.map