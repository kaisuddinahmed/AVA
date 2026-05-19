// ============================================================================
// MoveOutcome repo — unit tests with mocked prisma client.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

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

const store: Row[] = [];
let nextId = 1;

const moveOutcome = {
  create: vi.fn(async (args: { data: Partial<Row> }) => {
    const row: Row = {
      id: `m${nextId++}`,
      sessionId: args.data.sessionId ?? "",
      interventionId: args.data.interventionId ?? null,
      tacticId: args.data.tacticId ?? "",
      frictionId: args.data.frictionId ?? "",
      attributionTag: args.data.attributionTag ?? "",
      predictedMood: args.data.predictedMood ?? null,
      predictedTier: args.data.predictedTier ?? null,
      predictedResponse: args.data.predictedResponse ?? null,
      actualMood: null,
      actualTier: null,
      actualResponse: null,
      accuracy: null,
      status: args.data.status ?? "pending",
      firedAt: new Date(),
      resolvedAt: null,
    };
    store.push(row);
    return row;
  }),
  findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
    const matches = store.filter((r) =>
      Object.entries(args.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
    matches.sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());
    return matches[0] ?? null;
  }),
  findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
    const list = store.filter((r) =>
      Object.entries(args.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
    return list.slice(0, args.take ?? list.length);
  }),
  update: vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
    const r = store.find((x) => x.id === args.where.id);
    if (!r) throw new Error("not found");
    Object.assign(r, args.data);
    return r;
  }),
  updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
    let count = 0;
    for (const r of store) {
      if (Object.entries(args.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v)) {
        Object.assign(r, args.data);
        count++;
      }
    }
    return { count };
  }),
  count: vi.fn(async () => store.length),
  groupBy: vi.fn(async (args: { by: string[]; where?: Record<string, unknown> }) => {
    const list = store.filter((r) =>
      Object.entries(args.where ?? {}).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
    const buckets = new Map<string, Row[]>();
    for (const r of list) {
      const key = (r as unknown as Record<string, unknown>)[args.by[0]] as string;
      const arr = buckets.get(key) ?? [];
      arr.push(r);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries()).map(([k, rs]) => ({
      [args.by[0]]: k,
      _avg: {
        accuracy:
          rs.reduce((s, r) => s + (r.accuracy ?? 0), 0) /
          Math.max(1, rs.filter((r) => r.accuracy != null).length),
      },
      _count: { _all: rs.length },
    }));
  }),
};

const fakePrisma = { moveOutcome };
vi.mock("../client.js", () => ({ prisma: fakePrisma }));

const repo = await import("./move-outcome.repo.js");

beforeEach(() => {
  store.length = 0;
  nextId = 1;
  Object.values(moveOutcome).forEach((fn) => fn.mockClear());
});

describe("recordPrediction", () => {
  it("creates a pending row with the given fields", async () => {
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "F042_step1",
      frictionId: "F042",
      attributionTag: "F042:active_comparison:passthrough",
      predictedMood: "engaged",
      predictedTier: "ACTIVE",
      predictedResponse: "click_cta",
    });
    expect(store).toHaveLength(1);
    expect(store[0].status).toBe("pending");
    expect(store[0].predictedMood).toBe("engaged");
  });
});

describe("resolveLatestPending", () => {
  it("resolves the most recent pending row with accuracy=1.0 on exact match", async () => {
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "F042_step1",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "engaged",
      predictedTier: "ACTIVE",
      predictedResponse: "click_cta",
    });
    const resolved = await repo.resolveLatestPending({
      sessionId: "s1",
      actualMood: "engaged",
      actualTier: "ACTIVE",
      actualResponse: "click_cta",
    });
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.accuracy).toBeCloseTo(1.0, 5);
  });

  it("partial match scores 0.6 when only mood matches", async () => {
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "F042_step0",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "engaged",
      predictedTier: "ACTIVE",
      predictedResponse: "click_cta",
    });
    const r = await repo.resolveLatestPending({
      sessionId: "s1",
      actualMood: "engaged",
      actualTier: "NUDGE",
      actualResponse: "ignore",
    });
    expect(r?.accuracy).toBeCloseTo(0.6, 5);
  });

  it("returns null when there is nothing pending", async () => {
    const r = await repo.resolveLatestPending({ sessionId: "ghost", actualMood: "x" });
    expect(r).toBeNull();
  });

  it("resolves the latest pending row (multiple pending → most recent wins)", async () => {
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "F042_step0",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "engaged",
    });
    // Manipulate the second one to be later.
    await new Promise((r) => setTimeout(r, 5));
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "F042_step1",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "hesitant",
    });
    const r = await repo.resolveLatestPending({
      sessionId: "s1",
      actualMood: "hesitant",
    });
    expect(r?.tacticId).toBe("F042_step1");
    expect(r?.status).toBe("resolved");
    // The older one should still be pending.
    expect(store[0].status).toBe("pending");
  });
});

describe("abandonPendingForSession", () => {
  it("marks all pending rows for a session as abandoned", async () => {
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "t1",
      frictionId: "F042",
      attributionTag: "tag",
    });
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "t2",
      frictionId: "F042",
      attributionTag: "tag",
    });
    const { count } = await repo.abandonPendingForSession("s1");
    expect(count).toBe(2);
    expect(store.every((r) => r.status === "abandoned")).toBe(true);
  });
});

describe("aggregateByTactic", () => {
  it("returns avg accuracy per tactic for resolved rows", async () => {
    // Tactic A — two resolved rows: full match (1.0) + mood-only match (0.6).
    await repo.recordPrediction({
      sessionId: "s1",
      tacticId: "A",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "engaged",
      predictedTier: "ACTIVE",
      predictedResponse: "click_cta",
    });
    await repo.resolveLatestPending({
      sessionId: "s1",
      actualMood: "engaged",
      actualTier: "ACTIVE",
      actualResponse: "click_cta",
    }); // 1.0

    await repo.recordPrediction({
      sessionId: "s2",
      tacticId: "A",
      frictionId: "F042",
      attributionTag: "tag",
      predictedMood: "engaged",
      predictedTier: "ACTIVE",
    });
    await repo.resolveLatestPending({
      sessionId: "s2",
      actualMood: "engaged", // mood match only → 0.6
      actualTier: "NUDGE",
    });

    // Tactic B — one resolved row, accuracy 0.0.
    await repo.recordPrediction({
      sessionId: "s3",
      tacticId: "B",
      frictionId: "F100",
      attributionTag: "tag",
      predictedMood: "engaged",
    });
    await repo.resolveLatestPending({ sessionId: "s3", actualMood: "leaving" });

    const agg = await repo.aggregateByTactic();
    const a = agg.find((r) => r.tacticId === "A")!;
    const b = agg.find((r) => r.tacticId === "B")!;
    expect(a.fires).toBe(2);
    expect(a.avgAccuracy).toBeCloseTo(0.8, 5); // (1.0 + 0.6) / 2
    expect(b.fires).toBe(1);
    expect(b.avgAccuracy).toBeCloseTo(0.0, 5);
  });
});
