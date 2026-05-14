// ============================================================================
// AnalyzerRun Repository — onboarding analysis lifecycle
// ============================================================================

import { prisma } from "../client.js";

export type CreateAnalyzerRunInput = {
  siteConfigId: string;
  status?: string;
  phase?: string;
  source?: string;
  behaviorCoverage?: number;
  frictionCoverage?: number;
  avgConfidence?: number;
  summary?: string;
  errorMessage?: string;
};

export type UpdateAnalyzerRunInput = Partial<{
  status: string;
  phase: string;
  behaviorCoverage: number;
  frictionCoverage: number;
  avgConfidence: number;
  summary: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
}>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createAnalyzerRun(data: CreateAnalyzerRunInput) {
  const db = prisma as any;
  return db.analyzerRun.create({ data });
}

export async function getAnalyzerRun(id: string) {
  const db = prisma as any;
  return db.analyzerRun.findUnique({
    where: { id },
    include: { siteConfig: true },
  });
}

export async function updateAnalyzerRun(id: string, data: UpdateAnalyzerRunInput) {
  const db = prisma as any;
  return db.analyzerRun.update({
    where: { id },
    data,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

export async function setAnalyzerRunPhase(id: string, phase: string) {
  const db = prisma as any;
  return db.analyzerRun.update({
    where: { id },
    data: { phase },
  });
}

export async function completeAnalyzerRun(
  id: string,
  data?: Partial<{
    phase: string;
    behaviorCoverage: number;
    frictionCoverage: number;
    avgConfidence: number;
    summary: string;
  }>,
) {
  const db = prisma as any;
  return db.analyzerRun.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(),
      ...(data?.phase ? { phase: data.phase } : {}),
      ...(data?.behaviorCoverage !== undefined
        ? { behaviorCoverage: data.behaviorCoverage }
        : {}),
      ...(data?.frictionCoverage !== undefined
        ? { frictionCoverage: data.frictionCoverage }
        : {}),
      ...(data?.avgConfidence !== undefined
        ? { avgConfidence: data.avgConfidence }
        : {}),
      ...(data?.summary ? { summary: data.summary } : {}),
    },
  });
}

export async function failAnalyzerRun(id: string, errorMessage: string) {
  const db = prisma as any;
  return db.analyzerRun.update({
    where: { id },
    data: {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listAnalyzerRunsBySite(siteConfigId: string, limit = 20) {
  const db = prisma as any;
  return db.analyzerRun.findMany({
    where: { siteConfigId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getLatestAnalyzerRunBySite(siteConfigId: string) {
  const db = prisma as any;
  return db.analyzerRun.findFirst({
    where: { siteConfigId },
    orderBy: { startedAt: "desc" },
  });
}

export async function getAnalyzerRunWithMappings(
  id: string,
  options?: { behaviorLimit?: number; frictionLimit?: number },
) {
  const db = prisma as any;
  return db.analyzerRun.findUnique({
    where: { id },
    include: {
      siteConfig: true,
      behaviorMappings: {
        orderBy: { confidence: "desc" },
        take: options?.behaviorLimit ?? 100,
      },
      frictionMappings: {
        orderBy: { confidence: "desc" },
        take: options?.frictionLimit ?? 100,
      },
    },
  });
}
