// ============================================================================
// Intervention Repository — intervention tracking + outcome recording
// ============================================================================

import { prisma } from "../client.js";

export type CreateInterventionInput = {
  sessionId: string;
  evaluationId: string;
  type: string; // passive | nudge | active | escalate
  actionCode: string;
  frictionId: string;
  payload: string; // JSON
  mswimScoreAtFire: number;
  tierAtFire: string;
  /** Cart value at the moment the intervention was fired — used for revenue attribution */
  cartValueAtFire?: number;
  /** Phase 4.1 — direct attribution keys. Stamped only when ALL four
   *  resolver conditions hold (see attribution-resolver.ts). Null on legacy /
   *  non-attributable interventions; revenue queries fall back to the
   *  experiment-assignment + frictionId + time-window heuristic. */
  recommendationId?: string | null;
  experimentId?: string | null;
};

export type InterventionOutcomeInput = {
  status: "delivered" | "dismissed" | "converted" | "ignored";
  conversionAction?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createIntervention(data: CreateInterventionInput) {
  return prisma.intervention.create({ data });
}

export async function getIntervention(id: string) {
  return prisma.intervention.findUnique({
    where: { id },
    include: { evaluation: true },
  });
}

// ---------------------------------------------------------------------------
// Outcome tracking
// ---------------------------------------------------------------------------

export async function recordOutcome(
  id: string,
  outcome: InterventionOutcomeInput
) {
  const now = new Date();
  const timestampField: Record<string, Date> = {};

  switch (outcome.status) {
    case "delivered":
      timestampField.deliveredAt = now;
      break;
    case "dismissed":
      timestampField.dismissedAt = now;
      break;
    case "converted":
      timestampField.convertedAt = now;
      break;
    case "ignored":
      timestampField.ignoredAt = now;
      break;
  }

  return prisma.intervention.update({
    where: { id },
    data: {
      status: outcome.status,
      ...timestampField,
      ...(outcome.conversionAction
        ? { conversionAction: outcome.conversionAction }
        : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getInterventionsBySession(sessionId: string) {
  return prisma.intervention.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
  });
}

export async function getRecentInterventionsBySession(
  sessionId: string,
  limit = 5
) {
  return prisma.intervention.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function getInterventionsByStatus(status: string, limit = 20) {
  return prisma.intervention.findMany({
    where: { status },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function getInterventionsByType(
  type: string,
  options?: { status?: string; limit?: number }
) {
  return prisma.intervention.findMany({
    where: {
      type,
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: options?.limit ?? 20,
  });
}

/**
 * Count interventions by type for a given session (for MSWIM gate checks).
 */
export async function countInterventionsByType(
  sessionId: string,
  type: string
) {
  return prisma.intervention.count({
    where: { sessionId, type },
  });
}

/**
 * Get the last intervention for a session (for cooldown checks).
 */
export async function getLastIntervention(sessionId: string) {
  return prisma.intervention.findFirst({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
  });
}

/**
 * Get interventions for a specific friction ID (for duplicate gate checks).
 */
export async function getInterventionsByFriction(
  sessionId: string,
  frictionId: string
) {
  return prisma.intervention.findMany({
    where: { sessionId, frictionId },
    orderBy: { timestamp: "desc" },
  });
}

/**
 * List all interventions with optional limit, time filter, and site scoping.
 */
export async function listInterventions(options?: { limit?: number; since?: Date; siteUrl?: string }) {
  const where: Record<string, unknown> = {};
  if (options?.since) where.timestamp = { gte: options.since };
  if (options?.siteUrl) where.session = { siteUrl: options.siteUrl };
  return prisma.intervention.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: options?.limit ?? 100,
  });
}

/**
 * Fire-and-forget training-log write for the conversational shopping agent.
 * Caller wraps in try/catch — failures here must NEVER interrupt the
 * conversation flow. Note: callers historically passed fields that don't
 * match the Intervention schema (siteUrl, firedAt) — those are dropped here.
 * TODO(Phase 2): align this with the real Intervention contract or move
 * to a dedicated AgentActionLog model.
 */
export async function createAgentActionLog(data: {
  sessionId: string;
  actionCode: string;
  intentRaw?: string;
  intentAction?: string;
  intentCategory?: string | null;
  intentAttributes?: string;
  productsShown?: string;
  turnIndex?: number;
  latencyMs?: number;
}): Promise<unknown> {
  return (prisma as unknown as {
    intervention: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  }).intervention.create({ data });
}

/**
 * Outcome counts for interventions in a terminal state since `since`.
 * Used by the drift detector to compute conversion/dismissal rates.
 */
export async function getOutcomeCounts(since: Date): Promise<{
  total: number;
  converted: number;
  dismissed: number;
}> {
  const baseWhere = {
    timestamp: { gte: since },
    status: { in: ["converted", "dismissed", "ignored"] },
  };
  const [total, converted, dismissed] = await Promise.all([
    prisma.intervention.count({ where: baseWhere }),
    prisma.intervention.count({ where: { ...baseWhere, status: "converted" } }),
    prisma.intervention.count({ where: { ...baseWhere, status: "dismissed" } }),
  ]);
  return { total, converted, dismissed };
}

/**
 * Converted interventions with cart values populated, scoped to a site + window.
 * Used by the weekly insight digest to compute attributed revenue.
 */
export async function listConvertedWithCartValue(
  siteUrl: string,
  since: Date,
): Promise<Array<{
  cartValueAtFire: number | null;
  cartValueAtConversion: number | null;
  frictionId: string;
}>> {
  return prisma.intervention.findMany({
    where: {
      session: { siteUrl },
      timestamp: { gte: since },
      status: "converted",
      cartValueAtFire: { not: null },
    },
    select: {
      cartValueAtFire: true,
      cartValueAtConversion: true,
      frictionId: true,
    },
  });
}

/**
 * Aggregate intervention outcomes grouped by frictionId for a site within
 * a time window. Used by the recommendation engine (Phase 3.1) to rank
 * underperforming F-codes.
 */
export async function countOutcomesByFriction(
  siteUrl: string,
  since: Date,
): Promise<Array<{
  frictionId: string;
  total: number;
  converted: number;
  dismissed: number;
  ignored: number;
}>> {
  const rows = await prisma.intervention.groupBy({
    by: ["frictionId", "status"],
    where: {
      session: { siteUrl },
      timestamp: { gte: since },
      status: { in: ["converted", "dismissed", "ignored", "delivered"] },
    },
    _count: { id: true },
  });
  const byFriction = new Map<string, { total: number; converted: number; dismissed: number; ignored: number }>();
  for (const r of rows as Array<{ frictionId: string; status: string; _count: { id: number } }>) {
    const fid = r.frictionId;
    let entry = byFriction.get(fid);
    if (!entry) {
      entry = { total: 0, converted: 0, dismissed: 0, ignored: 0 };
      byFriction.set(fid, entry);
    }
    entry.total += r._count.id;
    if (r.status === "converted") entry.converted += r._count.id;
    else if (r.status === "dismissed") entry.dismissed += r._count.id;
    else if (r.status === "ignored") entry.ignored += r._count.id;
    // `delivered` counts toward total but not any specific outcome bucket.
  }
  return Array.from(byFriction.entries()).map(([frictionId, v]) => ({ frictionId, ...v }));
}
