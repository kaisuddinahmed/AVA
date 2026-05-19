// ============================================================================
// MoveOutcome Repository — predict → measure → feedback.
//
// Thinking Layer step 7 (2026-05-19). Records every SalespersonMove's
// prediction at fire time, then resolves it against the next observed
// evaluation. Aggregates feed the recommendation engine's per-tactic
// confidence.
// ============================================================================

import { prisma as basePrisma } from "../client.js";

// ----- Prisma client type bridge (same pattern as visitor-mind.repo.ts) ----
type Row = {
  id: string;
  sessionId: string;
  interventionId: string | null;
  tacticId: string;
  frictionId: string;
  attributionTag: string;
  predictedMood: string | null;
  predictedTier: string | null;
  predictedResponse: string | null;
  actualMood: string | null;
  actualTier: string | null;
  actualResponse: string | null;
  accuracy: number | null;
  status: string;
  firedAt: Date;
  resolvedAt: Date | null;
};

type Delegate = {
  create(args: { data: Partial<Row> & Pick<Row, "sessionId" | "tacticId" | "frictionId" | "attributionTag"> }): Promise<Row>;
  findFirst(args: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> }): Promise<Row | null>;
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number }): Promise<Row[]>;
  update(args: { where: { id: string }; data: Partial<Row> }): Promise<Row>;
  updateMany(args: { where: Record<string, unknown>; data: Partial<Row> }): Promise<{ count: number }>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
  groupBy(args: {
    by: ReadonlyArray<keyof Row>;
    where?: Record<string, unknown>;
    _avg?: Record<string, boolean>;
    _count?: { _all: true };
  }): Promise<Array<Record<string, unknown>>>;
};

type PrismaWithMoveOutcome = typeof basePrisma & { moveOutcome: Delegate };
const prisma = basePrisma as PrismaWithMoveOutcome;

// ----- Domain types --------------------------------------------------------

export type PredictedResponse = "click_cta" | "ask_followup" | "ignore" | "leave";

export interface RecordPredictionInput {
  sessionId: string;
  interventionId?: string | null;
  tacticId: string;
  frictionId: string;
  attributionTag: string;
  predictedMood?: string | null;
  predictedTier?: string | null;
  predictedResponse?: PredictedResponse | null;
}

export interface ResolveOutcomeInput {
  sessionId: string;
  actualMood?: string | null;
  actualTier?: string | null;
  actualResponse?: PredictedResponse | null;
}

// ----- Public API ----------------------------------------------------------

/** Stamp a new prediction at intervene-fire time. */
export async function recordPrediction(input: RecordPredictionInput): Promise<Row> {
  return prisma.moveOutcome.create({
    data: {
      sessionId: input.sessionId,
      interventionId: input.interventionId ?? null,
      tacticId: input.tacticId,
      frictionId: input.frictionId,
      attributionTag: input.attributionTag,
      predictedMood: input.predictedMood ?? null,
      predictedTier: input.predictedTier ?? null,
      predictedResponse: input.predictedResponse ?? null,
      status: "pending",
    },
  });
}

/**
 * Resolve the most recent pending prediction for a session. Returns the
 * resolved row, or null when there was nothing to resolve.
 *
 * Accuracy scoring (deliberately simple — step 7 baseline):
 *   - exact mood match: +0.6
 *   - same tier:        +0.3
 *   - same response:    +0.1
 *   Total clamps to [0, 1].
 */
export async function resolveLatestPending(
  resolution: ResolveOutcomeInput,
): Promise<Row | null> {
  const pending = await prisma.moveOutcome.findFirst({
    where: { sessionId: resolution.sessionId, status: "pending" },
    orderBy: { firedAt: "desc" },
  });
  if (!pending) return null;

  let accuracy = 0;
  if (
    pending.predictedMood &&
    resolution.actualMood &&
    pending.predictedMood === resolution.actualMood
  ) {
    accuracy += 0.6;
  }
  if (
    pending.predictedTier &&
    resolution.actualTier &&
    pending.predictedTier === resolution.actualTier
  ) {
    accuracy += 0.3;
  }
  if (
    pending.predictedResponse &&
    resolution.actualResponse &&
    pending.predictedResponse === resolution.actualResponse
  ) {
    accuracy += 0.1;
  }
  accuracy = Math.max(0, Math.min(1, accuracy));

  return prisma.moveOutcome.update({
    where: { id: pending.id },
    data: {
      actualMood: resolution.actualMood ?? null,
      actualTier: resolution.actualTier ?? null,
      actualResponse: resolution.actualResponse ?? null,
      accuracy,
      status: "resolved",
      resolvedAt: new Date(),
    },
  });
}

/** Mark all pending outcomes for a session as abandoned (session ended). */
export async function abandonPendingForSession(sessionId: string): Promise<{ count: number }> {
  return prisma.moveOutcome.updateMany({
    where: { sessionId, status: "pending" },
    data: { status: "abandoned", resolvedAt: new Date() },
  });
}

/**
 * Aggregate prediction accuracy per tactic over a time window. Returns
 * `[{ tacticId, fires, avgAccuracy }]` ordered by fires descending — the
 * input the recommendation engine reads to weight tactic confidence.
 */
export async function aggregateByTactic(opts: {
  since?: Date;
} = {}): Promise<Array<{ tacticId: string; fires: number; avgAccuracy: number | null }>> {
  const where: Record<string, unknown> = { status: "resolved" };
  if (opts.since) where.resolvedAt = { gte: opts.since };

  const rows = await prisma.moveOutcome.groupBy({
    by: ["tacticId"],
    where,
    _avg: { accuracy: true },
    _count: { _all: true },
  });

  return rows
    .map((r) => ({
      tacticId: (r.tacticId as string) ?? "",
      fires: ((r._count as { _all: number } | undefined)?._all) ?? 0,
      avgAccuracy:
        ((r._avg as { accuracy: number | null } | undefined)?.accuracy) ?? null,
    }))
    .sort((a, b) => b.fires - a.fires);
}

/** Test helper — fetch a row by id. */
export async function findById(id: string): Promise<Row | null> {
  const list = await prisma.moveOutcome.findMany({ where: { id }, take: 1 });
  return list[0] ?? null;
}
