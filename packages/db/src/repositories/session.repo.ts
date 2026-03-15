// ============================================================================
// Session Repository — CRUD + MSWIM counter updates
// ============================================================================

import { prisma } from "../client.js";
import type { Prisma } from "@prisma/client";

export type CreateSessionInput = {
  visitorId?: string;
  siteUrl: string;
  deviceType: string;
  referrerType: string;
  isLoggedIn?: boolean;
  isRepeatVisitor?: boolean;
};

export type UpdateSessionInput = Partial<{
  lastActivityAt: Date;
  cartValue: number;
  cartItemCount: number;
  status: string;
  isLoggedIn: boolean;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalConversions: number;
  suppressNonPassive: boolean;
  totalVoiceInterventionsFired: number;
  voiceMuted: boolean;
}>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSession(data: CreateSessionInput) {
  return prisma.session.create({ data });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: { events: false, evaluations: false, interventions: false },
  });
}

export async function getSessionFull(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      events: { orderBy: { timestamp: "asc" } },
      evaluations: { orderBy: { timestamp: "desc" }, take: 5 },
      interventions: { orderBy: { timestamp: "desc" }, take: 10 },
    },
  });
}

export async function updateSession(id: string, data: UpdateSessionInput) {
  return prisma.session.update({ where: { id }, data });
}

export async function touchSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
}

export async function endSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { status: "ended", lastActivityAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// MSWIM counter helpers
// ---------------------------------------------------------------------------

export async function incrementInterventionsFired(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalInterventionsFired: { increment: 1 } },
  });
}

export async function incrementDismissals(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalDismissals: { increment: 1 } },
  });
}

export async function incrementConversions(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalConversions: { increment: 1 } },
  });
}

/**
 * Add cart lift to Session.attributedRevenue.
 * Called when an intervention converts — adds the delta (cartNow - cartAtFire).
 */
export async function addAttributedRevenue(id: string, lift: number) {
  if (lift <= 0) return;
  return prisma.session.update({
    where: { id },
    data: { attributedRevenue: { increment: lift } },
  });
}

/**
 * Mark session as part of the 5% control group (no interventions fired).
 */
export async function markControlSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { isControlSession: true },
  });
}

export async function setSuppressNonPassive(id: string, suppress: boolean) {
  return prisma.session.update({
    where: { id },
    data: { suppressNonPassive: suppress },
  });
}

export async function incrementVoiceInterventionsFired(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalVoiceInterventionsFired: { increment: 1 } },
  });
}

export async function setVoiceMuted(id: string) {
  return prisma.session.update({
    where: { id },
    data: { voiceMuted: true },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listActiveSessions(siteUrl?: string) {
  const where: Prisma.SessionWhereInput = { status: "active" };
  if (siteUrl) where.siteUrl = siteUrl;

  return prisma.session.findMany({
    where,
    orderBy: { lastActivityAt: "desc" },
    take: 50,
  });
}

export async function getRecentSessions(limit = 20) {
  return prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

export async function incrementPageViews(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalPageViews: { increment: 1 } },
  });
}

export async function setEntryPage(
  id: string,
  url: string,
  opts: {
    landingReferrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  } = {}
) {
  return prisma.session.update({
    where: { id },
    data: { entryPage: url, ...opts },
  });
}

export async function setExitPage(id: string, url: string) {
  return prisma.session.update({
    where: { id },
    data: { exitPage: url, endedAt: new Date() },
  });
}

export async function accumulateTimeOnSite(id: string, ms: number) {
  return prisma.session.update({
    where: { id },
    data: { totalTimeOnSiteMs: { increment: ms } },
  });
}

// ---------------------------------------------------------------------------
// Analytics queries
// ---------------------------------------------------------------------------

/** Bounce rate: sessions with exactly 1 page view divided by total sessions */
export async function getBounceRate(siteUrl: string, since?: Date) {
  const where = {
    siteUrl,
    ...(since ? { startedAt: { gte: since } } : {}),
  };
  const [total, bounced] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.count({ where: { ...where, totalPageViews: 1 } }),
  ]);
  return { total, bounced, bounceRate: total > 0 ? bounced / total : 0 };
}

/** Traffic source breakdown: group by referrerType with conversion stats */
export async function getTrafficSourceBreakdown(siteUrl: string, since?: Date) {
  const sessions = await prisma.session.findMany({
    where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
    select: { referrerType: true, totalConversions: true },
    take: 5000,
  });

  const groups = new Map<string, { sessions: number; conversions: number }>();
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
export async function getDeviceBreakdown(siteUrl: string, since?: Date) {
  const sessions = await prisma.session.findMany({
    where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
    select: { deviceType: true, totalConversions: true },
    take: 5000,
  });

  const groups = new Map<string, { sessions: number; conversions: number }>();
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
export async function getSessionVolumeByDay(
  siteUrl: string,
  since?: Date,
  until?: Date
) {
  const sessions = await prisma.session.findMany({
    where: {
      siteUrl,
      ...(since ? { startedAt: { gte: since } } : {}),
      ...(until ? { startedAt: { lte: until } } : {}),
    },
    select: { startedAt: true },
    orderBy: { startedAt: "asc" },
  });

  const buckets = new Map<string, number>();
  for (const s of sessions) {
    const day = s.startedAt.toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/** Weekly retention cohort: new vs returning visitors by ISO week */
export async function getRetentionCohort(
  siteUrl: string,
  since?: Date,
  until?: Date
) {
  const sessions = await prisma.session.findMany({
    where: {
      siteUrl,
      ...(since ? { startedAt: { gte: since } } : {}),
      ...(until ? { startedAt: { lte: until } } : {}),
    },
    select: { startedAt: true, isRepeatVisitor: true },
  });

  const buckets = new Map<string, { new: number; returning: number }>();
  for (const s of sessions) {
    const d = s.startedAt;
    // ISO week label: YYYY-Www
    const week = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, "0")}`;
    const existing = buckets.get(week) ?? { new: 0, returning: 0 };
    if (s.isRepeatVisitor) existing.returning++; else existing.new++;
    buckets.set(week, existing);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, g]) => ({ week, ...g, total: g.new + g.returning }));
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Avg session duration using lastActivityAt - startedAt as proxy */
export async function getAvgSessionDuration(siteUrl: string, since?: Date) {
  const sessions = await prisma.session.findMany({
    where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
    select: { startedAt: true, lastActivityAt: true },
    take: 5000,
  });
  if (sessions.length === 0) return 0;
  const totalMs = sessions.reduce(
    (sum, s) => sum + (s.lastActivityAt.getTime() - s.startedAt.getTime()),
    0
  );
  return Math.round(totalMs / sessions.length);
}

/** Avg page views per session */
export async function getAvgPageViews(siteUrl: string, since?: Date) {
  const sessions = await prisma.session.findMany({
    where: { siteUrl, ...(since ? { startedAt: { gte: since } } : {}) },
    select: { totalPageViews: true },
    take: 5000,
  });
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + s.totalPageViews, 0);
  return Math.round((total / sessions.length) * 10) / 10;
}
