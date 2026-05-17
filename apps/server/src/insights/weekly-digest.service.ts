// ============================================================================
// Weekly digest — Phase 3.6.
//
// Pure-composition service: pulls real numbers from existing repos and
// returns a structured `WeeklyDigest` payload. NO LLM, NO email (Phase 3.7
// handles email delivery). The dashboard's "Digest" preview panel and the
// future email template both consume the same shape.
//
// Sections covered (control-room narrative for the locked Phase 3 pitch):
//
//   period           — window math (start/end/days)
//   traffic          — sessions, WoW delta, top frictions by firings
//   recommendations  — approvals/pending/rejected this week
//   outcomes         — decision tally + attributed revenue
//   topFrictions     — top N by intervention firings (helps merchant prioritize)
// ============================================================================

import {
  SessionRepo,
  RecommendationRepo,
  RecommendationOutcomeRepo,
  InterventionRepo,
} from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "weekly-digest.service" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildDigestOptions {
  /** Days to look back. Default 7. */
  windowDays?: number;
  /** Override `now` for deterministic tests. */
  now?: Date;
  /** Cap on top-frictions list returned. Default 5. */
  topFrictionsLimit?: number;
}

export interface DigestFrictionRow {
  frictionId: string;
  total: number;
  converted: number;
  dismissed: number;
  ignored: number;
  conversionRate: number;
  dismissalRate: number;
}

export type DecisionTally = {
  ship: number;
  rollback: number;
  extend: number;
  inconclusive: number;
  total: number;
};

export interface WeeklyDigest {
  siteUrl: string;
  period: { start: Date; end: Date; days: number };
  traffic: {
    sessions: number;
    sessionsPrior: number;
    wowDeltaPct: number | null;
  };
  recommendations: {
    approvedThisWeek: number;
    rejectedThisWeek: number;
    pendingNow: number;
    activeNow: number;
  };
  outcomes: {
    snapshotsThisWeek: number;
    decisions: DecisionTally;
    attributedRevenue: number;
  };
  topFrictions: DigestFrictionRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wow(curr: number, prior: number): number | null {
  if (prior === 0) return curr === 0 ? 0 : null; // no baseline — undefined growth
  return ((curr - prior) / prior) * 100;
}

function emptyDecisionTally(): DecisionTally {
  return { ship: 0, rollback: 0, extend: 0, inconclusive: 0, total: 0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildWeeklyDigest(
  siteUrl: string,
  opts: BuildDigestOptions = {},
): Promise<WeeklyDigest> {
  const windowDays = opts.windowDays ?? 7;
  const now = opts.now ?? new Date();
  const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const priorStart = new Date(start.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const topFrictionsLimit = opts.topFrictionsLimit ?? 5;

  // ── traffic ─────────────────────────────────────────────────────────────
  const [sessions, sessionsPrior] = await Promise.all([
    SessionRepo.countByPeriod(siteUrl, start, now),
    SessionRepo.countByPeriod(siteUrl, priorStart, start),
  ]);

  // ── recommendations (window scoped via approvedAt / rejectedAt / createdAt)
  // listBySite returns all statuses; we filter in JS — typical sites have
  // <500 recs in the window.
  const allRecs = (await RecommendationRepo.listBySite(siteUrl, { limit: 500 })) as Array<{
    id: string;
    status: string;
    approvedAt: Date | string | null;
    rejectedAt: Date | string | null;
    createdAt: Date | string;
  }>;
  const inWindow = (d: Date | string | null) => {
    if (!d) return false;
    const t = (typeof d === "string" ? new Date(d) : d).getTime();
    return t >= start.getTime() && t <= now.getTime();
  };
  let approvedThisWeek = 0, rejectedThisWeek = 0, pendingNow = 0, activeNow = 0;
  for (const r of allRecs) {
    if (r.status === "approved" && inWindow(r.approvedAt)) approvedThisWeek++;
    if (r.status === "rejected" && inWindow(r.rejectedAt)) rejectedThisWeek++;
    if (r.status === "pending") pendingNow++;
    if (r.status === "active") activeNow++;
  }

  // ── outcomes ────────────────────────────────────────────────────────────
  // RecommendationOutcomeRepo.listRecent is system-wide; filter to this site
  // via the recommendation map.
  const recById = new Map(allRecs.map((r) => [r.id, r]));
  const recentOutcomes = (await RecommendationOutcomeRepo.listRecent({
    since: start,
    limit: 500,
  })) as Array<{
    recommendationId: string;
    decision: string | null;
    attributedRevenue: number;
  }>;
  const decisions = emptyDecisionTally();
  let attributedRevenue = 0;
  let snapshotsThisWeek = 0;
  for (const o of recentOutcomes) {
    if (!recById.has(o.recommendationId)) continue; // different site
    snapshotsThisWeek++;
    attributedRevenue += o.attributedRevenue ?? 0;
    const d = (o.decision ?? "inconclusive") as keyof DecisionTally;
    if (d === "ship" || d === "rollback" || d === "extend" || d === "inconclusive") {
      decisions[d]++;
      decisions.total++;
    }
  }

  // ── top frictions ───────────────────────────────────────────────────────
  const frictionRows = await InterventionRepo.countOutcomesByFriction(siteUrl, start);
  const topFrictions: DigestFrictionRow[] = frictionRows
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, topFrictionsLimit)
    .map((r) => ({
      frictionId: r.frictionId,
      total: r.total,
      converted: r.converted,
      dismissed: r.dismissed,
      ignored: r.ignored,
      conversionRate: r.total === 0 ? 0 : r.converted / r.total,
      dismissalRate: r.total === 0 ? 0 : r.dismissed / r.total,
    }));

  const digest: WeeklyDigest = {
    siteUrl,
    period: { start, end: now, days: windowDays },
    traffic: {
      sessions,
      sessionsPrior,
      wowDeltaPct: wow(sessions, sessionsPrior),
    },
    recommendations: { approvedThisWeek, rejectedThisWeek, pendingNow, activeNow },
    outcomes: { snapshotsThisWeek, decisions, attributedRevenue },
    topFrictions,
  };

  log.info(
    {
      siteUrl,
      windowDays,
      sessions,
      approvedThisWeek,
      decisions,
      attributedRevenue,
    },
    "[Weekly digest] built",
  );
  return digest;
}
