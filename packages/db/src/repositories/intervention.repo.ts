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
