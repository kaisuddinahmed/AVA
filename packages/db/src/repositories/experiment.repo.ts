// ============================================================================
// Experiment Repository — A/B test definitions + session assignments
// ============================================================================

import { prisma } from "../client.js";

export type CreateExperimentInput = {
  name: string;
  description?: string;
  siteUrl?: string | null;
  trafficPercent?: number;
  variants: string; // JSON array of ExperimentVariant
  primaryMetric?: string;
  minSampleSize?: number;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createExperiment(data: CreateExperimentInput) {
  return prisma.experiment.create({ data });
}

export async function getExperiment(id: string) {
  return prisma.experiment.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
}

export async function updateExperiment(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    status: string;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
    startedAt: Date;
    endedAt: Date;
  }>,
) {
  return prisma.experiment.update({ where: { id }, data });
}

export async function startExperiment(id: string) {
  return prisma.experiment.update({
    where: { id },
    data: { status: "running", startedAt: new Date() },
  });
}

export async function endExperiment(id: string) {
  return prisma.experiment.update({
    where: { id },
    data: { status: "completed", endedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listExperiments(options?: {
  status?: string;
  siteUrl?: string | null;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (options?.status) where.status = options.status;
  if (options?.siteUrl !== undefined) where.siteUrl = options.siteUrl;

  return prisma.experiment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
    include: { _count: { select: { assignments: true } } },
  });
}

/**
 * Get the active (running) experiment for a site.
 * A session's site may match a site-specific experiment OR a global (null siteUrl) one.
 */
export async function getActiveExperiment(siteUrl?: string) {
  // Site-specific first
  if (siteUrl) {
    const siteExperiment = await prisma.experiment.findFirst({
      where: { status: "running", siteUrl },
    });
    if (siteExperiment) return siteExperiment;
  }

  // Global fallback
  return prisma.experiment.findFirst({
    where: { status: "running", siteUrl: null },
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function assignSession(
  experimentId: string,
  sessionId: string,
  variantId: string,
) {
  return prisma.experimentAssignment.create({
    data: { experimentId, sessionId, variantId },
  });
}

export async function getSessionAssignment(
  experimentId: string,
  sessionId: string,
) {
  return prisma.experimentAssignment.findUnique({
    where: { experimentId_sessionId: { experimentId, sessionId } },
  });
}

// ---------------------------------------------------------------------------
// Metrics aggregation
// ---------------------------------------------------------------------------

/**
 * Get per-variant outcome counts by joining assignments → interventions.
 * Returns raw counts for each variant: total, converted, dismissed, ignored.
 */
export async function getVariantOutcomes(experimentId: string) {
  const assignments = await prisma.experimentAssignment.findMany({
    where: { experimentId },
    select: { sessionId: true, variantId: true },
  });

  if (assignments.length === 0) return [];

  // Group sessions by variant
  const variantSessions = new Map<string, string[]>();
  for (const a of assignments) {
    const sessions = variantSessions.get(a.variantId) ?? [];
    sessions.push(a.sessionId);
    variantSessions.set(a.variantId, sessions);
  }

  const results: {
    variantId: string;
    total: number;
    converted: number;
    dismissed: number;
    ignored: number;
    avgCompositeScore: number;
    avgIntentScore: number;
    avgFrictionScore: number;
  }[] = [];

  for (const [variantId, sessionIds] of variantSessions) {
    const interventions = await prisma.intervention.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { status: true, mswimScoreAtFire: true },
    });

    // Also get evaluation signal averages
    const evalAggs = await prisma.evaluation.aggregate({
      where: { sessionId: { in: sessionIds } },
      _avg: {
        compositeScore: true,
        intentScore: true,
        frictionScore: true,
      },
    });

    const total = interventions.length;
    const converted = interventions.filter((i) => i.status === "converted").length;
    const dismissed = interventions.filter((i) => i.status === "dismissed").length;
    const ignored = interventions.filter((i) => i.status === "ignored").length;

    results.push({
      variantId,
      total,
      converted,
      dismissed,
      ignored,
      avgCompositeScore: evalAggs._avg.compositeScore ?? 0,
      avgIntentScore: evalAggs._avg.intentScore ?? 0,
      avgFrictionScore: evalAggs._avg.frictionScore ?? 0,
    });
  }

  return results;
}

/**
 * Per-variant outcomes WITH revenue attribution. Used by the Phase 3.4
 * recommendation-outcome service to attribute cart value to each arm of
 * an experiment. Revenue is `cartValueAtConversion` (falls back to
 * `cartValueAtFire`) summed across converted interventions for sessions
 * assigned to each variant.
 *
 * SCOPING — Codex P1 fix: revenue/conversion math must reflect ONLY
 * interventions caused by this experiment's action within its window.
 *   - `windowStart` / `windowEnd` clamp the intervention timestamp
 *   - `frictionId` filters to the F-code this recommendation targets,
 *     so unrelated friction firings in the same session don't bleed
 *     into attribution
 * All three are optional to keep the function usable from other call
 * sites; the recommendation-outcome service always passes them.
 */
export async function getVariantOutcomesWithRevenue(
  experimentId: string,
  opts: {
    windowStart?: Date;
    windowEnd?: Date;
    frictionId?: string;
  } = {},
): Promise<Array<{
  variantId: string;
  sessions: number;
  total: number;          // interventions fired
  converted: number;
  dismissed: number;
  ignored: number;
  revenue: number;        // sum of cart values on converted
}>> {
  const assignments = await prisma.experimentAssignment.findMany({
    where: { experimentId },
    select: { sessionId: true, variantId: true },
  });
  if (assignments.length === 0) return [];

  const variantSessions = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = variantSessions.get(a.variantId) ?? [];
    arr.push(a.sessionId);
    variantSessions.set(a.variantId, arr);
  }

  const out: Array<{
    variantId: string; sessions: number; total: number; converted: number;
    dismissed: number; ignored: number; revenue: number;
  }> = [];

  const timestampFilter: Record<string, Date> = {};
  if (opts.windowStart) timestampFilter.gte = opts.windowStart;
  if (opts.windowEnd)   timestampFilter.lte = opts.windowEnd;

  for (const [variantId, sessionIds] of variantSessions) {
    const interventions = await prisma.intervention.findMany({
      where: {
        sessionId: { in: sessionIds },
        ...(opts.frictionId ? { frictionId: opts.frictionId } : {}),
        ...(opts.windowStart || opts.windowEnd ? { timestamp: timestampFilter } : {}),
      },
      select: {
        status: true,
        cartValueAtFire: true,
        cartValueAtConversion: true,
      },
    });
    const total = interventions.length;
    let converted = 0, dismissed = 0, ignored = 0, revenue = 0;
    for (const iv of interventions) {
      if (iv.status === "converted") {
        converted++;
        revenue += iv.cartValueAtConversion ?? iv.cartValueAtFire ?? 0;
      } else if (iv.status === "dismissed") dismissed++;
      else if (iv.status === "ignored") ignored++;
    }
    out.push({
      variantId,
      sessions: sessionIds.length,
      total,
      converted,
      dismissed,
      ignored,
      revenue,
    });
  }
  return out;
}
