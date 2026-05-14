// ============================================================================
// InsightSnapshot Repository — merchant insight + CRO recommendation storage
// ============================================================================

import { prisma } from "../client.js";

export interface CreateInsightSnapshotInput {
  siteUrl: string;
  periodStart: Date;
  periodEnd: Date;
  sessionsAnalyzed: number;
  frictionsCaught: number;
  attributedRevenue: number;
  topFrictionTypes: string; // JSON: string[]
  wowDeltaPct?: number;
  recommendations: string; // JSON array
  croFindings?: string;     // JSON array
}

export async function createInsightSnapshot(data: CreateInsightSnapshotInput) {
  return prisma.insightSnapshot.create({ data });
}

export async function getLatestInsightSnapshot(siteUrl: string) {
  return prisma.insightSnapshot.findFirst({
    where: { siteUrl },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestCROFindings(siteUrl: string) {
  const snap = await prisma.insightSnapshot.findFirst({
    where: { siteUrl, croFindings: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  return snap;
}

export async function listInsightSnapshots(siteUrl: string, limit = 10) {
  return prisma.insightSnapshot.findMany({
    where: { siteUrl },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Return the most recent snapshot for a site that was created on or after
 * `since` (typically today). Used by the CRO job to decide whether to upsert
 * the day's snapshot or append to an existing one.
 */
export async function findLatestSince(siteUrl: string, since: Date) {
  return prisma.insightSnapshot.findFirst({
    where: { siteUrl, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}

/** Attach (or replace) the croFindings JSON on an existing snapshot. */
export async function setCROFindings(id: string, croFindingsJson: string) {
  return prisma.insightSnapshot.update({
    where: { id },
    data: { croFindings: croFindingsJson },
  });
}
