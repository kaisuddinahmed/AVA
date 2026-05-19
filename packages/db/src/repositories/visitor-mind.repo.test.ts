// ============================================================================
// VisitorMind Repository — unit tests.
//
// Mocks the prisma client so we exercise the repo's JSON serialization,
// ring-buffer caps, dedupe, and merge logic without hitting a real database.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ----- Mock the prisma client singleton ------------------------------------
//
// The repo imports `prisma` from "../client.js". We replace that module's
// prisma export with an in-memory fake that mimics findUnique/upsert/update/
// create/deleteMany on a single `visitorMind` table.

type Row = {
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

const store = new Map<string, Row>(); // keyed by sessionId

function defaults(sessionId: string, siteUrl: string): Row {
  return {
    id: `id-${sessionId}`,
    sessionId,
    siteUrl,
    mood: "unknown",
    moodHistory: "[]",
    interestPerProduct: "{}",
    inferredObjections: "[]",
    decisionPressure: 0,
    comparisonSet: "[]",
    priceSensitivity: 50,
    personaHint: null,
    confidence: 0,
    lastEvaluationId: null,
    evaluationsConsidered: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const visitorMind = {
  findUnique: vi.fn(async (args: { where: { sessionId: string } }) => {
    return store.get(args.where.sessionId) ?? null;
  }),
  upsert: vi.fn(
    async (args: {
      where: { sessionId: string };
      update: Partial<Row>;
      create: Partial<Row> & { sessionId: string; siteUrl: string };
    }) => {
      const existing = store.get(args.where.sessionId);
      if (existing) {
        const next = { ...existing, ...args.update, updatedAt: new Date() };
        store.set(args.where.sessionId, next);
        return next;
      }
      const base = defaults(args.create.sessionId, args.create.siteUrl);
      const next = { ...base, ...args.create };
      store.set(args.create.sessionId, next);
      return next;
    },
  ),
  update: vi.fn(
    async (args: {
      where: { sessionId: string };
      data: Partial<Row>;
    }) => {
      const existing = store.get(args.where.sessionId);
      if (!existing) throw new Error("not found");
      const next = { ...existing, ...args.data, updatedAt: new Date() };
      store.set(args.where.sessionId, next);
      return next;
    },
  ),
  create: vi.fn(
    async (args: {
      data: Partial<Row> & { sessionId: string; siteUrl: string };
    }) => {
      const base = defaults(args.data.sessionId, args.data.siteUrl);
      const next = { ...base, ...args.data };
      store.set(args.data.sessionId, next);
      return next;
    },
  ),
  deleteMany: vi.fn(
    async (args: { where: { sessionId?: string; updatedAt?: { lt: Date } } }) => {
      let count = 0;
      if (args.where.sessionId) {
        if (store.delete(args.where.sessionId)) count = 1;
      } else if (args.where.updatedAt?.lt) {
        const cutoff = args.where.updatedAt.lt.getTime();
        for (const [k, v] of store) {
          if (v.updatedAt.getTime() < cutoff) {
            store.delete(k);
            count++;
          }
        }
      }
      return { count };
    },
  ),
};

type FakePrisma = {
  visitorMind: typeof visitorMind;
  $transaction: <T>(fn: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};
const fakePrisma: FakePrisma = {
  visitorMind,
  $transaction: async <T>(fn: (tx: FakePrisma) => Promise<T>) => fn(fakePrisma),
};

vi.mock("../client.js", () => ({ prisma: fakePrisma }));

// ----- Import the repo AFTER the mock is registered ------------------------
const repo = await import("./visitor-mind.repo.js");

beforeEach(() => {
  store.clear();
  visitorMind.findUnique.mockClear();
  visitorMind.upsert.mockClear();
  visitorMind.update.mockClear();
  visitorMind.create.mockClear();
  visitorMind.deleteMany.mockClear();
});

describe("VisitorMind repo — basic IO", () => {
  it("getBySession returns null when not present", async () => {
    expect(await repo.getBySession("s1")).toBeNull();
  });

  it("upsert creates a row on first call and updates on second", async () => {
    await repo.upsert({ sessionId: "s1", siteUrl: "https://shop.dev" });
    expect(store.size).toBe(1);

    await repo.upsert({
      sessionId: "s1",
      siteUrl: "https://shop.dev",
      decisionPressure: 42,
    });
    const row = store.get("s1");
    expect(row?.decisionPressure).toBe(42);
    expect(store.size).toBe(1);
  });

  it("getViewBySession deserializes JSON fields", async () => {
    store.set("s1", {
      ...defaults("s1", "https://shop.dev"),
      mood: "hesitant",
      moodHistory: JSON.stringify([{ mood: "hesitant", ts: 1, evidence: "x" }]),
      comparisonSet: JSON.stringify(["sku-a", "sku-b"]),
      interestPerProduct: JSON.stringify({ "sku-a": 70 }),
    });

    const view = await repo.getViewBySession("s1");
    expect(view).not.toBeNull();
    expect(view!.mood).toBe("hesitant");
    expect(view!.moodHistory).toEqual([
      { mood: "hesitant", ts: 1, evidence: "x" },
    ]);
    expect(view!.comparisonSet).toEqual(["sku-a", "sku-b"]);
    expect(view!.interestPerProduct).toEqual({ "sku-a": 70 });
  });

  it("getViewBySession returns safe defaults for corrupt JSON", async () => {
    store.set("s1", {
      ...defaults("s1", "https://shop.dev"),
      moodHistory: "not-json",
      comparisonSet: "{garbage",
    });
    const view = await repo.getViewBySession("s1");
    expect(view!.moodHistory).toEqual([]);
    expect(view!.comparisonSet).toEqual([]);
  });
});

describe("recordMoodTransition", () => {
  it("creates the row on first transition", async () => {
    await repo.recordMoodTransition("s1", "https://shop.dev", "confident", "landing");
    const row = store.get("s1");
    expect(row?.mood).toBe("confident");
    const hist = JSON.parse(row!.moodHistory);
    expect(hist).toHaveLength(1);
    expect(hist[0].mood).toBe("confident");
    expect(hist[0].evidence).toBe("landing");
  });

  it("no-ops when the new mood matches the current mood", async () => {
    await repo.recordMoodTransition("s1", "https://shop.dev", "confident", "a");
    await repo.recordMoodTransition("s1", "https://shop.dev", "confident", "b");
    const hist = JSON.parse(store.get("s1")!.moodHistory);
    expect(hist).toHaveLength(1);
    expect(hist[0].evidence).toBe("a"); // earlier evidence preserved
  });

  it("appends and updates current mood on transition", async () => {
    await repo.recordMoodTransition("s1", "https://shop.dev", "confident", "a");
    await repo.recordMoodTransition("s1", "https://shop.dev", "hesitant", "b");
    const row = store.get("s1")!;
    expect(row.mood).toBe("hesitant");
    const hist = JSON.parse(row.moodHistory);
    expect(hist.map((h: { mood: string }) => h.mood)).toEqual([
      "confident",
      "hesitant",
    ]);
  });

  it("ring-caps moodHistory at MAX_MOOD_HISTORY (20)", async () => {
    // Alternate moods to force 22 distinct transitions.
    const moods = ["confident", "hesitant"] as const;
    for (let i = 0; i < 22; i++) {
      await repo.recordMoodTransition(
        "s1",
        "https://shop.dev",
        moods[i % 2],
        `e${i}`,
      );
    }
    const hist = JSON.parse(store.get("s1")!.moodHistory);
    expect(hist).toHaveLength(20);
    expect(hist[0].evidence).toBe("e2"); // oldest two evicted
  });
});

describe("addInferredObjection", () => {
  it("creates a new objection entry", async () => {
    await repo.addInferredObjection("s1", "https://shop.dev", {
      type: "price",
      confidence: 0.7,
      evidence: ["F060"],
    });
    const objs = JSON.parse(store.get("s1")!.inferredObjections);
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe("price");
    expect(objs[0].confidence).toBe(0.7);
  });

  it("merges duplicate types — confidence takes max, evidence dedupes", async () => {
    await repo.addInferredObjection("s1", "https://shop.dev", {
      type: "price",
      confidence: 0.6,
      evidence: ["F060"],
    });
    await repo.addInferredObjection("s1", "https://shop.dev", {
      type: "price",
      confidence: 0.9,
      evidence: ["F060", "STT: too expensive"],
    });
    const objs = JSON.parse(store.get("s1")!.inferredObjections);
    expect(objs).toHaveLength(1);
    expect(objs[0].confidence).toBe(0.9);
    expect(objs[0].evidence).toEqual(["F060", "STT: too expensive"]);
  });

  it("clamps confidence into [0, 1]", async () => {
    await repo.addInferredObjection("s1", "https://shop.dev", {
      type: "fit",
      confidence: 1.5,
      evidence: [],
    });
    const objs = JSON.parse(store.get("s1")!.inferredObjections);
    expect(objs[0].confidence).toBe(1);
  });

  it("caps the inferredObjections list at 10", async () => {
    const types = [
      "price",
      "fit",
      "trust",
      "delivery",
      "choice",
      "timing",
    ] as const;
    // Push 12 distinct synthetic objections by manipulating evidence so we
    // can fill past the 10 cap. We re-use the same types but each call
    // merges; to actually exercise the cap we mutate the store directly.
    const list = [];
    for (let i = 0; i < 12; i++) {
      list.push({
        type: types[i % types.length],
        confidence: 0.5,
        evidence: [`e${i}`],
        ts: i,
      });
    }
    store.set("s1", {
      ...defaults("s1", "https://shop.dev"),
      inferredObjections: JSON.stringify(list),
    });

    await repo.addInferredObjection("s1", "https://shop.dev", {
      type: "trust",
      confidence: 0.99,
      evidence: ["new"],
    });
    const objs = JSON.parse(store.get("s1")!.inferredObjections);
    // Merge collapses one duplicate type, then trim caps to 10.
    expect(objs.length).toBeLessThanOrEqual(10);
  });
});

describe("markProductInterest", () => {
  it("creates on first call, accumulates on subsequent", async () => {
    await repo.markProductInterest("s1", "https://shop.dev", "sku-a", 30);
    await repo.markProductInterest("s1", "https://shop.dev", "sku-a", 50);
    const map = JSON.parse(store.get("s1")!.interestPerProduct);
    expect(map["sku-a"]).toBe(80);
  });

  it("clamps the accumulated score to [0, 100]", async () => {
    await repo.markProductInterest("s1", "https://shop.dev", "sku-a", 200);
    expect(JSON.parse(store.get("s1")!.interestPerProduct)["sku-a"]).toBe(100);
  });

  it("evicts lowest-score keys when over MAX_INTEREST_KEYS (50)", async () => {
    const map: Record<string, number> = {};
    for (let i = 0; i < 50; i++) map[`sku-${i}`] = i + 1; // 1..50
    store.set("s1", {
      ...defaults("s1", "https://shop.dev"),
      interestPerProduct: JSON.stringify(map),
    });
    await repo.markProductInterest("s1", "https://shop.dev", "sku-new", 75);
    const out = JSON.parse(store.get("s1")!.interestPerProduct);
    const keys = Object.keys(out);
    expect(keys).toHaveLength(50);
    expect(keys).toContain("sku-new");
    expect(keys).not.toContain("sku-0"); // lowest got evicted
  });
});

describe("addToComparisonSet", () => {
  it("adds SKUs and dedupes", async () => {
    await repo.addToComparisonSet("s1", "https://shop.dev", "sku-a");
    await repo.addToComparisonSet("s1", "https://shop.dev", "sku-b");
    await repo.addToComparisonSet("s1", "https://shop.dev", "sku-a");
    const set = JSON.parse(store.get("s1")!.comparisonSet);
    expect(set).toEqual(["sku-a", "sku-b"]);
  });

  it("ring-caps the set at 30 (FIFO)", async () => {
    const seed = Array.from({ length: 30 }, (_, i) => `sku-${i}`);
    store.set("s1", {
      ...defaults("s1", "https://shop.dev"),
      comparisonSet: JSON.stringify(seed),
    });
    await repo.addToComparisonSet("s1", "https://shop.dev", "sku-new");
    const set = JSON.parse(store.get("s1")!.comparisonSet);
    expect(set).toHaveLength(30);
    expect(set[0]).toBe("sku-1"); // oldest evicted
    expect(set[set.length - 1]).toBe("sku-new");
  });
});

describe("updateScalar", () => {
  it("partial patch leaves other scalars untouched", async () => {
    await repo.upsert({
      sessionId: "s1",
      siteUrl: "https://shop.dev",
      decisionPressure: 40,
      priceSensitivity: 60,
    });
    await repo.updateScalar("s1", "https://shop.dev", { decisionPressure: 75 });
    const row = store.get("s1")!;
    expect(row.decisionPressure).toBe(75);
    expect(row.priceSensitivity).toBe(60);
  });

  it("clamps scalar values into [0, 100]", async () => {
    await repo.updateScalar("s1", "https://shop.dev", {
      decisionPressure: 250,
      confidence: -10,
    });
    const row = store.get("s1")!;
    expect(row.decisionPressure).toBe(100);
    expect(row.confidence).toBe(0);
  });

  it("creates the row when none exists (upsert behavior)", async () => {
    await repo.updateScalar("s1", "https://shop.dev", { confidence: 80 });
    expect(store.get("s1")?.confidence).toBe(80);
  });
});

describe("purge", () => {
  it("purgeBySession removes a single row", async () => {
    await repo.upsert({ sessionId: "s1", siteUrl: "https://shop.dev" });
    await repo.purgeBySession("s1");
    expect(store.size).toBe(0);
  });

  it("purgeIdleSince removes only rows older than the cutoff", async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    store.set("old", { ...defaults("old", "https://shop.dev"), updatedAt: oldDate });
    store.set("new", { ...defaults("new", "https://shop.dev") });
    await repo.purgeIdleSince(new Date(Date.now() - 1000 * 60));
    expect(store.has("old")).toBe(false);
    expect(store.has("new")).toBe(true);
  });
});
