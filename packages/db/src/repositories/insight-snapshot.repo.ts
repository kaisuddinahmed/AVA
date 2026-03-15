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
