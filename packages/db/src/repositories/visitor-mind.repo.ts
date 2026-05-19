// ============================================================================
// VisitorMind Repository — persistent mental model of the visitor.
// Thinking Layer (2026-05-19) — step 1 of project_ava_thinking_layer_plan.
//
// Read by apps/server/src/think/ before deciding the next SalespersonMove.
// Written from evaluate.service.ts after each MSWIM evaluation.
//
// PRIVACY: inferredObjections / moodHistory evidence may contain visitor
// utterances captured via STT. Treat as session-bounded; purge when the
// session ends. Never export raw evidence into analytics.
//
// Concurrency: every mutation that does read-modify-write on a JSON field
// is wrapped in prisma.$transaction so two concurrent evaluate batches for
// the same session serialize to a coherent final state — matches the
// pattern in conversation-state.repo.ts.
// ============================================================================

import { prisma as basePrisma } from "../client.js";

// ----- Prisma client type bridge -------------------------------------------
// The VisitorMind model was added in the 2026-05-19 Thinking Layer plan. Until
// `npm run db:push` (or `prisma generate`) is re-run, the generated client
// won't expose `prisma.visitorMind`. This narrow cast keeps typecheck green
// pre-regen; once the client is regenerated the cast is a no-op because the
// real delegate satisfies this shape.
type VisitorMindRow = {
  id: string;
  sessionId: string;
  siteUrl: string;
  mood: string;
  moodHistory: string;
  interestPerProduct: string;
  inferredObjections: string;
  decisionPressure: number;
  comparisonSet: string;
  priceSensitivity: number;
  personaHint: string | null;
  confidence: number;
  lastEvaluationId: string | null;
  evaluationsConsidered: number;
  createdAt: Date;
  updatedAt: Date;
};

type VisitorMindDelegate = {
  findUnique(args: {
    where: { sessionId: string };
  }): Promise<VisitorMindRow | null>;
  upsert(args: {
    where: { sessionId: string };
    update: Partial<VisitorMindRow>;
    create: Partial<VisitorMindRow> & { sessionId: string; siteUrl: string };
  }): Promise<VisitorMindRow>;
  update(args: {
    where: { sessionId: string };
    data: Partial<VisitorMindRow>;
  }): Promise<VisitorMindRow>;
  create(args: {
    data: Partial<VisitorMindRow> & { sessionId: string; siteUrl: string };
  }): Promise<VisitorMindRow>;
  deleteMany(args: {
    where: { sessionId?: string; updatedAt?: { lt: Date } };
  }): Promise<{ count: number }>;
};

type PrismaWithVisitorMind = typeof basePrisma & {
  visitorMind: VisitorMindDelegate;
  $transaction<T>(
    fn: (tx: PrismaWithVisitorMind) => Promise<T>,
  ): Promise<T>;
};

const prisma = basePrisma as PrismaWithVisitorMind;

/** Run `fn` inside a prisma transaction with the augmented client type. */
function withTx<T>(
  fn: (tx: PrismaWithVisitorMind) => Promise<T>,
): Promise<T> {
  return (basePrisma as PrismaWithVisitorMind).$transaction(fn);
}

// ----- Domain types (mirror packages/shared/src/types/visitor-mind.ts) ------
// Kept inline so packages/db has no compile-time dep on @ava/shared.

export type Mood =
  | "unknown"
  | "confident"
  | "engaged"
  | "hesitant"
  | "frustrated"
  | "leaving";

export type PersonaHint =
  | "deal_hunter"
  | "researcher"
  | "impulse"
  | "gift_buyer"
  | "returning_loyal";

export type ObjectionType =
  | "price"
  | "fit"
  | "trust"
  | "delivery"
  | "choice"
  | "timing";

export interface MoodTransition {
  mood: Mood;
  ts: number;
  evidence: string;
}

export interface InferredObjection {
  type: ObjectionType;
  confidence: number;
  evidence: string[];
  ts: number;
}

export type InterestPerProduct = Record<string, number>;

// Bounds — kept in sync with @ava/shared VISITOR_MIND_BOUNDS.
const MAX_MOOD_HISTORY = 20;
const MAX_INFERRED_OBJECTIONS = 10;
const MAX_COMPARISON_SET = 30;
const MAX_INTEREST_KEYS = 50;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Return the row as stored, or null. Caller deserializes JSON fields. */
export async function getBySession(sessionId: string) {
  return prisma.visitorMind.findUnique({ where: { sessionId } });
}

/** Deserialized view — flat structure, no JSON strings, safe for think/. */
export async function getViewBySession(sessionId: string) {
  const row = await prisma.visitorMind.findUnique({ where: { sessionId } });
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    siteUrl: row.siteUrl,
    mood: row.mood as Mood,
    moodHistory: safeParse<MoodTransition[]>(row.moodHistory, []),
    interestPerProduct: safeParse<InterestPerProduct>(row.interestPerProduct, {}),
    inferredObjections: safeParse<InferredObjection[]>(row.inferredObjections, []),
    decisionPressure: row.decisionPressure,
    comparisonSet: safeParse<string[]>(row.comparisonSet, []),
    priceSensitivity: row.priceSensitivity,
    personaHint: (row.personaHint as PersonaHint | null) ?? null,
    confidence: row.confidence,
    lastEvaluationId: row.lastEvaluationId ?? null,
    evaluationsConsidered: row.evaluationsConsidered,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Upsert (scalars + raw JSON strings) — caller is responsible for serializing.
// Most code should prefer the typed helpers below.
// ---------------------------------------------------------------------------

export type UpsertVisitorMindInput = {
  sessionId: string;
  siteUrl: string;
  mood?: Mood;
  moodHistory?: string;            // already JSON-stringified
  interestPerProduct?: string;     // already JSON-stringified
  inferredObjections?: string;     // already JSON-stringified
  decisionPressure?: number;
  comparisonSet?: string;          // already JSON-stringified
  priceSensitivity?: number;
  personaHint?: PersonaHint | null;
  confidence?: number;
  lastEvaluationId?: string | null;
  evaluationsConsidered?: number;
};

export async function upsert(data: UpsertVisitorMindInput) {
  const { sessionId, siteUrl, ...rest } = data;
  return prisma.visitorMind.upsert({
    where: { sessionId },
    update: rest,
    create: { sessionId, siteUrl, ...rest },
  });
}

// ---------------------------------------------------------------------------
// Typed mutators — these are what evaluate.service.ts + think/ call.
// All are atomic via $transaction so concurrent evaluate batches serialize.
// ---------------------------------------------------------------------------

/**
 * Append a mood transition. If the new mood == the latest mood, the existing
 * row is left untouched (no-op append). Otherwise the new entry is pushed and
 * the history is ring-capped to MAX_MOOD_HISTORY.
 */
export async function recordMoodTransition(
  sessionId: string,
  siteUrl: string,
  mood: Mood,
  evidence: string,
) {
  return withTx(async (tx) => {
    const existing = await tx.visitorMind.findUnique({ where: { sessionId } });
    const prior = existing
      ? safeParse<MoodTransition[]>(existing.moodHistory, [])
      : [];
    const last = prior[prior.length - 1];

    // No-op if already in this mood.
    if (last && last.mood === mood && existing && existing.mood === mood) {
      return existing;
    }

    const next: MoodTransition = { mood, ts: Date.now(), evidence };
    const all = [...prior, next];
    const trimmed =
      all.length > MAX_MOOD_HISTORY
        ? all.slice(all.length - MAX_MOOD_HISTORY)
        : all;

    if (existing) {
      return tx.visitorMind.update({
        where: { sessionId },
        data: {
          mood,
          moodHistory: JSON.stringify(trimmed),
        },
      });
    }
    return tx.visitorMind.create({
      data: {
        sessionId,
        siteUrl,
        mood,
        moodHistory: JSON.stringify(trimmed),
      },
    });
  });
}

/**
 * Add an inferred objection. Ring-capped to MAX_INFERRED_OBJECTIONS. If an
 * objection of the same type already exists, its confidence is updated
 * (max of old and new) and evidence is merged-deduped rather than appended
 * as a new entry — prevents the list from filling with duplicates.
 */
export async function addInferredObjection(
  sessionId: string,
  siteUrl: string,
  objection: Omit<InferredObjection, "ts"> & { ts?: number },
) {
  return withTx(async (tx) => {
    const existing = await tx.visitorMind.findUnique({ where: { sessionId } });
    const prior = existing
      ? safeParse<InferredObjection[]>(existing.inferredObjections, [])
      : [];

    const incoming: InferredObjection = {
      type: objection.type,
      confidence: clamp01(objection.confidence),
      evidence: dedupe(objection.evidence ?? []),
      ts: objection.ts ?? Date.now(),
    };

    const idx = prior.findIndex((o) => o.type === incoming.type);
    let merged: InferredObjection[];
    if (idx >= 0) {
      const old = prior[idx];
      const updated: InferredObjection = {
        type: incoming.type,
        confidence: Math.max(old.confidence, incoming.confidence),
        evidence: dedupe([...old.evidence, ...incoming.evidence]),
        ts: incoming.ts,
      };
      merged = [...prior.slice(0, idx), ...prior.slice(idx + 1), updated];
    } else {
      merged = [...prior, incoming];
    }
    const trimmed =
      merged.length > MAX_INFERRED_OBJECTIONS
        ? merged.slice(merged.length - MAX_INFERRED_OBJECTIONS)
        : merged;

    const payload = { inferredObjections: JSON.stringify(trimmed) };
    if (existing) {
      return tx.visitorMind.update({ where: { sessionId }, data: payload });
    }
    return tx.visitorMind.create({
      data: { sessionId, siteUrl, ...payload },
    });
  });
}

/**
 * Bump engagement for a SKU. Score is clamped 0-100. Map is capped at
 * MAX_INTEREST_KEYS — when over, the lowest-score keys are evicted.
 */
export async function markProductInterest(
  sessionId: string,
  siteUrl: string,
  sku: string,
  scoreDelta: number,
) {
  return withTx(async (tx) => {
    const existing = await tx.visitorMind.findUnique({ where: { sessionId } });
    const prior = existing
      ? safeParse<InterestPerProduct>(existing.interestPerProduct, {})
      : {};
    const next: InterestPerProduct = { ...prior };
    next[sku] = clamp(0, 100, (prior[sku] ?? 0) + scoreDelta);

    const trimmed = capInterestMap(next, MAX_INTEREST_KEYS);
    const payload = { interestPerProduct: JSON.stringify(trimmed) };

    if (existing) {
      return tx.visitorMind.update({ where: { sessionId }, data: payload });
    }
    return tx.visitorMind.create({
      data: { sessionId, siteUrl, ...payload },
    });
  });
}

/**
 * Add a SKU to the comparison set. Deduped, ring-capped at
 * MAX_COMPARISON_SET (FIFO).
 */
export async function addToComparisonSet(
  sessionId: string,
  siteUrl: string,
  sku: string,
) {
  return withTx(async (tx) => {
    const existing = await tx.visitorMind.findUnique({ where: { sessionId } });
    const prior = existing
      ? safeParse<string[]>(existing.comparisonSet, [])
      : [];
    if (prior.includes(sku)) return existing ?? null;
    const merged = [...prior, sku];
    const trimmed =
      merged.length > MAX_COMPARISON_SET
        ? merged.slice(merged.length - MAX_COMPARISON_SET)
        : merged;
    const payload = { comparisonSet: JSON.stringify(trimmed) };
    if (existing) {
      return tx.visitorMind.update({ where: { sessionId }, data: payload });
    }
    return tx.visitorMind.create({
      data: { sessionId, siteUrl, ...payload },
    });
  });
}

/** Update scalar fields. Skips undefined keys so partial patches are safe. */
export async function updateScalar(
  sessionId: string,
  siteUrl: string,
  patch: {
    decisionPressure?: number;
    priceSensitivity?: number;
    personaHint?: PersonaHint | null;
    confidence?: number;
    lastEvaluationId?: string | null;
    evaluationsConsidered?: number;
  },
) {
  const data: Record<string, unknown> = {};
  if (patch.decisionPressure !== undefined)
    data.decisionPressure = clamp(0, 100, patch.decisionPressure);
  if (patch.priceSensitivity !== undefined)
    data.priceSensitivity = clamp(0, 100, patch.priceSensitivity);
  if (patch.personaHint !== undefined) data.personaHint = patch.personaHint;
  if (patch.confidence !== undefined)
    data.confidence = clamp(0, 100, patch.confidence);
  if (patch.lastEvaluationId !== undefined)
    data.lastEvaluationId = patch.lastEvaluationId;
  if (patch.evaluationsConsidered !== undefined)
    data.evaluationsConsidered = patch.evaluationsConsidered;

  return prisma.visitorMind.upsert({
    where: { sessionId },
    update: data,
    create: { sessionId, siteUrl, ...data },
  });
}

/** Purge state when a session ends (PII-bounded retention). */
export async function purgeBySession(sessionId: string) {
  return prisma.visitorMind.deleteMany({ where: { sessionId } });
}

/** Sweep idle minds older than `olderThan` (background job). */
export async function purgeIdleSince(olderThan: Date) {
  return prisma.visitorMind.deleteMany({
    where: { updatedAt: { lt: olderThan } },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(0, 1, v);
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function capInterestMap(
  m: InterestPerProduct,
  max: number,
): InterestPerProduct {
  const keys = Object.keys(m);
  if (keys.length <= max) return m;
  // Drop the lowest-scoring keys first.
  const sorted = keys.sort((a, b) => (m[a] ?? 0) - (m[b] ?? 0));
  const dropCount = keys.length - max;
  const next: InterestPerProduct = {};
  for (const k of sorted.slice(dropCount)) next[k] = m[k];
  return next;
}
