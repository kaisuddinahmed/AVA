// ============================================================================
// MerchantCoaching repo — unit tests with a mocked prisma client.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

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

const store = new Map<string, Row>();

function defaults(siteUrl: string): Row {
  return {
    id: `id-${siteUrl}`,
    siteUrl,
    tone: "unspecified",
    alwaysUpsell: "[]",
    neverDiscountBelowPct: 0,
    forbiddenClaims: "[]",
    priorityObjections: "[]",
    freeformNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const merchantCoaching = {
  findUnique: vi.fn(async (args: { where: { siteUrl: string } }) =>
    store.get(args.where.siteUrl) ?? null,
  ),
  upsert: vi.fn(
    async (args: {
      where: { siteUrl: string };
      update: Partial<Row>;
      create: Partial<Row> & { siteUrl: string };
    }) => {
      const existing = store.get(args.where.siteUrl);
      if (existing) {
        const next = { ...existing, ...args.update, updatedAt: new Date() };
        store.set(args.where.siteUrl, next);
        return next;
      }
      const base = defaults(args.create.siteUrl);
      const next = { ...base, ...args.create };
      store.set(args.create.siteUrl, next);
      return next;
    },
  ),
  deleteMany: vi.fn(async (args: { where: { siteUrl: string } }) => {
    const ok = store.delete(args.where.siteUrl);
    return { count: ok ? 1 : 0 };
  }),
};

const fakePrisma = { merchantCoaching };
vi.mock("../client.js", () => ({ prisma: fakePrisma }));

const repo = await import("./merchant-coaching.repo.js");

beforeEach(() => {
  store.clear();
  Object.values(merchantCoaching).forEach((fn) => fn.mockClear());
});

describe("MerchantCoaching repo", () => {
  it("getBySite returns null when nothing is set", async () => {
    expect(await repo.getBySite("https://shop.dev")).toBeNull();
  });

  it("upsert creates and subsequent calls partial-update", async () => {
    await repo.upsert({ siteUrl: "https://shop.dev", tone: "luxury" });
    await repo.upsert({
      siteUrl: "https://shop.dev",
      alwaysUpsell: ["warranty", "gift wrap"],
    });
    const view = await repo.getBySite("https://shop.dev");
    expect(view).not.toBeNull();
    expect(view!.tone).toBe("luxury");
    expect(view!.alwaysUpsell).toEqual(["warranty", "gift wrap"]);
  });

  it("deserializes JSON string arrays defensively", async () => {
    store.set("https://shop.dev", {
      ...defaults("https://shop.dev"),
      alwaysUpsell: "not-json",
      forbiddenClaims: '["legal-a", "legal-b"]',
    });
    const view = await repo.getBySite("https://shop.dev");
    expect(view!.alwaysUpsell).toEqual([]);
    expect(view!.forbiddenClaims).toEqual(["legal-a", "legal-b"]);
  });

  it("clamps neverDiscountBelowPct into [0, 100]", async () => {
    await repo.upsert({
      siteUrl: "https://shop.dev",
      neverDiscountBelowPct: 250,
    });
    const v = await repo.getBySite("https://shop.dev");
    expect(v!.neverDiscountBelowPct).toBe(100);
  });

  it("dedupes string array inputs and drops empties", async () => {
    await repo.upsert({
      siteUrl: "https://shop.dev",
      alwaysUpsell: ["warranty", " warranty ", "", "gift wrap"],
    });
    const v = await repo.getBySite("https://shop.dev");
    expect(v!.alwaysUpsell).toEqual(["warranty", "gift wrap"]);
  });
});

describe("toCoachingHints", () => {
  it("returns null when view is null", () => {
    expect(repo.toCoachingHints(null)).toBeNull();
  });

  it("returns null when every field is unspecified / empty", () => {
    const hints = repo.toCoachingHints({
      siteUrl: "x",
      tone: "unspecified",
      alwaysUpsell: [],
      neverDiscountBelowPct: 0,
      forbiddenClaims: [],
      priorityObjections: [],
      freeformNotes: null,
      updatedAt: new Date(),
    });
    expect(hints).toBeNull();
  });

  it("renders only set fields", () => {
    const hints = repo.toCoachingHints({
      siteUrl: "x",
      tone: "luxury",
      alwaysUpsell: ["warranty"],
      neverDiscountBelowPct: 15,
      forbiddenClaims: ["lowest price"],
      priorityObjections: ["price", "fit"],
      freeformNotes: "Always finish with a soft close.",
      updatedAt: new Date(),
    });
    expect(hints).toMatch(/tone: luxury/);
    expect(hints).toMatch(/always upsell: warranty/);
    expect(hints).toMatch(/never discount below 15%/);
    expect(hints).toMatch(/forbidden claims: lowest price/);
    expect(hints).toMatch(/priority objections: price, fit/);
    expect(hints).toMatch(/notes: Always finish/);
  });
});
