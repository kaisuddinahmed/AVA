// ============================================================================
// MerchantCoaching repository — per-site coaching for the salesperson.
// Thinking Layer step 9 (2026-05-19).
//
// Read by apps/server/src/think/ on every move. Written by the merchant
// via the dashboard.
// ============================================================================

import { prisma as basePrisma } from "../client.js";

type Row = {
  id: string;
  siteUrl: string;
  tone: string;
  alwaysUpsell: string;
  neverDiscountBelowPct: number;
  forbiddenClaims: string;
  priorityObjections: string;
  freeformNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Delegate = {
  findUnique(args: { where: { siteUrl: string } }): Promise<Row | null>;
  upsert(args: {
    where: { siteUrl: string };
    update: Partial<Row>;
    create: Partial<Row> & { siteUrl: string };
  }): Promise<Row>;
  deleteMany(args: { where: { siteUrl: string } }): Promise<{ count: number }>;
};

type PrismaWithMerchantCoaching = typeof basePrisma & {
  merchantCoaching: Delegate;
};
const prisma = basePrisma as PrismaWithMerchantCoaching;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Tone =
  | "luxury"
  | "playful"
  | "no_nonsense"
  | "warm"
  | "technical"
  | "unspecified";

export interface MerchantCoachingView {
  siteUrl: string;
  tone: Tone;
  alwaysUpsell: string[];
  neverDiscountBelowPct: number;
  forbiddenClaims: string[];
  priorityObjections: string[];
  freeformNotes: string | null;
  updatedAt: Date;
}

export interface UpsertMerchantCoachingInput {
  siteUrl: string;
  tone?: Tone;
  alwaysUpsell?: string[];
  neverDiscountBelowPct?: number;
  forbiddenClaims?: string[];
  priorityObjections?: string[];
  freeformNotes?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch the merchant's coaching, deserialized. Returns null when unset. */
export async function getBySite(siteUrl: string): Promise<MerchantCoachingView | null> {
  const row = await prisma.merchantCoaching.findUnique({ where: { siteUrl } });
  return row ? toView(row) : null;
}

/** Upsert with partial fields — string-array fields are JSON-serialized. */
export async function upsert(
  input: UpsertMerchantCoachingInput,
): Promise<MerchantCoachingView> {
  const data: Partial<Row> = {};
  if (input.tone !== undefined) data.tone = input.tone;
  if (input.alwaysUpsell !== undefined)
    data.alwaysUpsell = JSON.stringify(dedupe(input.alwaysUpsell));
  if (input.neverDiscountBelowPct !== undefined)
    data.neverDiscountBelowPct = clampInt(0, 100, input.neverDiscountBelowPct);
  if (input.forbiddenClaims !== undefined)
    data.forbiddenClaims = JSON.stringify(dedupe(input.forbiddenClaims));
  if (input.priorityObjections !== undefined)
    data.priorityObjections = JSON.stringify(dedupe(input.priorityObjections));
  if (input.freeformNotes !== undefined) data.freeformNotes = input.freeformNotes;

  const row = await prisma.merchantCoaching.upsert({
    where: { siteUrl: input.siteUrl },
    update: data,
    create: { siteUrl: input.siteUrl, ...data },
  });
  return toView(row);
}

/** Test / admin — wipe the row. */
export async function purgeBySite(siteUrl: string): Promise<{ count: number }> {
  return prisma.merchantCoaching.deleteMany({ where: { siteUrl } });
}

/**
 * Build the prompt fragment fed into LLM thinker as `coachingHints`.
 * Returns null when no coaching exists (the LLM prompt skips the line).
 */
export function toCoachingHints(view: MerchantCoachingView | null): string | null {
  if (!view) return null;
  const lines: string[] = [];
  if (view.tone !== "unspecified") lines.push(`tone: ${view.tone}`);
  if (view.alwaysUpsell.length > 0)
    lines.push(`always upsell: ${view.alwaysUpsell.join(", ")}`);
  if (view.neverDiscountBelowPct > 0)
    lines.push(`never discount below ${view.neverDiscountBelowPct}%`);
  if (view.forbiddenClaims.length > 0)
    lines.push(`forbidden claims: ${view.forbiddenClaims.join(", ")}`);
  if (view.priorityObjections.length > 0)
    lines.push(`priority objections: ${view.priorityObjections.join(", ")}`);
  if (view.freeformNotes && view.freeformNotes.trim().length > 0)
    lines.push(`notes: ${view.freeformNotes.trim()}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toView(row: Row): MerchantCoachingView {
  return {
    siteUrl: row.siteUrl,
    tone: row.tone as Tone,
    alwaysUpsell: safeArray(row.alwaysUpsell),
    neverDiscountBelowPct: row.neverDiscountBelowPct,
    forbiddenClaims: safeArray(row.forbiddenClaims),
    priorityObjections: safeArray(row.priorityObjections),
    freeformNotes: row.freeformNotes ?? null,
    updatedAt: row.updatedAt,
  };
}

function safeArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function clampInt(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}
