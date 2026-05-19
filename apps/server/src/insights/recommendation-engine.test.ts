// ============================================================================
// recommendation-engine — Phase 3.1 unit tests.
//
// Mocked InterventionRepo + RecommendationRepo. Asserts the deterministic
// rules produce the expected ranked candidates, that ranking respects
// expectedLift × confidence, and that de-duplication against in-flight
// recommendations works.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const countOutcomes = vi.fn();
const listBySite = vi.fn();
const createRec = vi.fn();
const aggregateByTactic = vi.fn();

vi.mock("@ava/db", () => ({
  InterventionRepo: {
    countOutcomesByFriction: (...args: unknown[]) => countOutcomes(...args),
  },
  RecommendationRepo: {
    listBySite: (...args: unknown[]) => listBySite(...args),
    createRecommendation: (...args: unknown[]) => createRec(...args),
  },
  MoveOutcomeRepo: {
    aggregateByTactic: (...args: unknown[]) => aggregateByTactic(...args),
  },
}));

import {
  generateRecommendations,
  generateAndPersist,
  confidenceFromSample,
  computeAccuracyMultiplier,
} from "./recommendation-engine.js";

beforeEach(() => {
  countOutcomes.mockReset();
  listBySite.mockReset().mockResolvedValue([]);
  createRec.mockReset().mockImplementation(async (data: unknown) => ({ id: "rec_x", ...(data as object) }));
  aggregateByTactic.mockReset().mockResolvedValue([]); // default: no accuracy signal
});

// ── Confidence helper ──────────────────────────────────────────────────────

describe("confidenceFromSample", () => {
  it("monotonically increases with sample size", () => {
    const points = [10, 30, 75, 150, 350, 1000].map((n) => confidenceFromSample(n));
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1]!);
    }
  });
  it("caps at 0.95 for very large samples", () => {
    expect(confidenceFromSample(100_000)).toBeLessThanOrEqual(0.95);
    expect(confidenceFromSample(100_000)).toBe(0.95);
  });
});

// ── Rule A — playbook swap ─────────────────────────────────────────────────

describe("Rule A — playbook swap for underperforming friction", () => {
  it("F042 firing 100 times with 2% conversion → recommend playbook with PLAYBOOK_F042 action", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 70, ignored: 28 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(1);
    const r = recs[0]!;
    expect(r.frictionId).toBe("F042");
    expect(r.actionCode).toBe("PLAYBOOK_F042");
    expect(r.expectedLiftPct).toBe(50);
    expect(r.sampleSizeBasis).toBe(100);
    expect(r.rationale).toMatch(/F042 fired 100 times/);
    expect(r.rationale).toMatch(/2\.0% conversion rate/);
    // payloadTemplate is the JSON of the playbook's first step.
    const payload = JSON.parse(r.payloadTemplate);
    expect(payload.voice_script.length).toBeLessThanOrEqual(80);
    expect(typeof payload.sales_dialog).toBe("string");
  });

  it("F042 firing 100 times with 8% conversion → NO recommendation (above threshold)", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 8, dismissed: 50, ignored: 42 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(0);
  });

  it("low sample size (<25) → skipped regardless of conversion rate", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 10, converted: 0, dismissed: 8, ignored: 2 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(0);
  });

  it("no playbook for the F-code → Rule A skips (Rule B handles if dismissal high)", async () => {
    countOutcomes.mockResolvedValue([
      // F999 has no playbook registered.
      { frictionId: "F999", total: 100, converted: 2, dismissed: 20, ignored: 78 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    // Dismissal rate is 20% — below Rule B threshold (50%) — so no Rule B either.
    expect(recs).toHaveLength(0);
  });
});

// ── Rule B — soften tier for high-dismissal friction ──────────────────────

describe("Rule B — soften tier for high-dismissal friction without a playbook", () => {
  it("F999 with 60% dismissal → SOFTEN_F999 recommendation at nudge tier", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F999", total: 50, converted: 5, dismissed: 30, ignored: 15 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(1);
    const r = recs[0]!;
    expect(r.actionCode).toBe("SOFTEN_F999");
    expect(r.interventionType).toBe("nudge");
    expect(r.rationale).toMatch(/60\.0% dismissal rate/);
    expect(r.expectedLiftPct).toBe(20);
  });

  it("F-code with a playbook is handled by Rule A, NOT Rule B (no duplicate)", async () => {
    // F042 has a playbook AND high dismissal — Rule A should win (its
    // continue; statement prevents Rule B from also firing).
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 90, ignored: 8 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(1);
    expect(recs[0]!.actionCode).toBe("PLAYBOOK_F042");
  });
});

// ── De-dup against in-flight ────────────────────────────────────────────────

describe("de-duplication against in-flight recommendations", () => {
  it("skips frictions that already have a pending Recommendation", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 70, ignored: 28 },
    ]);
    listBySite.mockResolvedValueOnce([
      { frictionId: "F042", status: "pending" },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(0);
  });

  it("skips frictions whose Recommendation is approved or active", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 70, ignored: 28 },
      { frictionId: "F100", total: 100, converted: 2, dismissed: 70, ignored: 28 },
    ]);
    listBySite.mockResolvedValueOnce([
      { frictionId: "F042", status: "approved" },
      { frictionId: "F100", status: "active" },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(0);
  });

  it("DOES NOT skip frictions whose only prior Recommendation is rejected or archived", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 70, ignored: 28 },
    ]);
    listBySite.mockResolvedValueOnce([
      { frictionId: "F042", status: "rejected" },
      { frictionId: "F042", status: "archived" },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(1);
  });
});

// ── Ranking ────────────────────────────────────────────────────────────────

describe("ranking — high-impact × high-confidence first", () => {
  it("orders candidates by expectedLift × confidence descending", async () => {
    countOutcomes.mockResolvedValue([
      // F999: Rule B path, expectedLift=20, low confidence (50 sample → discounted)
      { frictionId: "F999", total: 50, converted: 5, dismissed: 30, ignored: 15 },
      // F042: Rule A path, expectedLift=50, higher confidence (200 sample)
      { frictionId: "F042", total: 200, converted: 4, dismissed: 140, ignored: 56 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(2);
    expect(recs[0]!.frictionId).toBe("F042");
    expect(recs[1]!.frictionId).toBe("F999");
    expect(recs[0]!.rankScore).toBeGreaterThan(recs[1]!.rankScore);
  });

  it("respects the limit cap", async () => {
    // Generate 5 F-code rows that all qualify under Rule A (using known playbooks).
    countOutcomes.mockResolvedValue([
      { frictionId: "F020", total: 50, converted: 1, dismissed: 30, ignored: 19 },
      { frictionId: "F036", total: 60, converted: 1, dismissed: 35, ignored: 24 },
      { frictionId: "F042", total: 70, converted: 1, dismissed: 40, ignored: 29 },
      { frictionId: "F099", total: 80, converted: 1, dismissed: 45, ignored: 34 },
      { frictionId: "F100", total: 90, converted: 1, dismissed: 50, ignored: 39 },
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x", limit: 3 });
    expect(recs).toHaveLength(3);
  });
});

// ── Persistence ────────────────────────────────────────────────────────────

describe("generateAndPersist", () => {
  it("creates a Recommendation row for each candidate", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 100, converted: 2, dismissed: 70, ignored: 28 },
      { frictionId: "F100", total: 100, converted: 2, dismissed: 70, ignored: 28 },
    ]);
    const persisted = await generateAndPersist({ siteUrl: "https://x" });
    expect(persisted).toHaveLength(2);
    expect(createRec).toHaveBeenCalledTimes(2);
    const firstArg = createRec.mock.calls[0]![0] as Record<string, unknown>;
    expect(firstArg.frictionId).toBe("F042");
    expect(firstArg.actionCode).toBe("PLAYBOOK_F042");
  });
});

// ── Window control ─────────────────────────────────────────────────────────

describe("window control", () => {
  it("passes the analysis window to countOutcomesByFriction", async () => {
    countOutcomes.mockResolvedValue([]);
    const now = new Date("2026-05-16T00:00:00Z");
    await generateRecommendations({ siteUrl: "https://x", windowDays: 7, now });
    const args = countOutcomes.mock.calls[0]!;
    expect(args[0]).toBe("https://x");
    // since = now - 7 days = 2026-05-09
    expect((args[1] as Date).toISOString().slice(0, 10)).toBe("2026-05-09");
  });
});

// ── Codex 2026-05-19 — accuracy multiplier (closing the learning loop) ─────

describe("computeAccuracyMultiplier", () => {
  it("returns 1.0 (neutral) when no signal exists for the tactic", () => {
    const map = new Map<string, number>();
    expect(computeAccuracyMultiplier(map, "F042_step0")).toBe(1.0);
  });

  it("returns 1.0 at perfect accuracy", () => {
    const map = new Map([["F042_step0", 1.0]]);
    expect(computeAccuracyMultiplier(map, "F042_step0")).toBe(1.0);
  });

  it("returns 0.5 at zero accuracy (damped, not killed)", () => {
    const map = new Map([["F042_step0", 0.0]]);
    expect(computeAccuracyMultiplier(map, "F042_step0")).toBe(0.5);
  });

  it("scales linearly between 0.5 and 1.0", () => {
    const map = new Map([
      ["a", 0.6],
      ["b", 0.2],
    ]);
    expect(computeAccuracyMultiplier(map, "a")).toBeCloseTo(0.8, 5);
    expect(computeAccuracyMultiplier(map, "b")).toBeCloseTo(0.6, 5);
  });

  it("clamps out-of-range inputs", () => {
    const map = new Map([
      ["high", 1.5],
      ["low", -0.5],
    ]);
    expect(computeAccuracyMultiplier(map, "high")).toBe(1.0);
    expect(computeAccuracyMultiplier(map, "low")).toBe(0.5);
  });
});

describe("rule A — accuracy weighting in rankScore", () => {
  it("damps rankScore for low-accuracy tactics relative to no-signal baseline", async () => {
    // Both rows fire 150 times with 1% conversion, but only F042 has an
    // accuracy signal in MoveOutcome. F042_step0 has 0.0 accuracy → 0.5x;
    // F100 has no signal → 1.0x. F100 should therefore outrank F042.
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 150, converted: 1, dismissed: 30, ignored: 0, delivered: 0, sent: 0 },
      { frictionId: "F100", total: 150, converted: 1, dismissed: 30, ignored: 0, delivered: 0, sent: 0 },
    ]);
    aggregateByTactic.mockResolvedValue([
      { tacticId: "F042_step0", fires: 150, avgAccuracy: 0.0 },
      // No row for F100_step0.
    ]);
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    const f042 = recs.find((r) => r.frictionId === "F042");
    const f100 = recs.find((r) => r.frictionId === "F100");
    expect(f042).toBeTruthy();
    expect(f100).toBeTruthy();
    expect(f100!.rankScore).toBeGreaterThan(f042!.rankScore);
    // Same sample size + lift + confidence; only multiplier differs.
    expect(f100!.rankScore / f042!.rankScore).toBeCloseTo(2.0, 5);
  });

  it("survives MoveOutcome aggregate fetch failure (neutral ranking)", async () => {
    countOutcomes.mockResolvedValue([
      { frictionId: "F042", total: 150, converted: 1, dismissed: 30, ignored: 0, delivered: 0, sent: 0 },
    ]);
    aggregateByTactic.mockRejectedValue(new Error("DB down"));
    const recs = await generateRecommendations({ siteUrl: "https://x" });
    expect(recs).toHaveLength(1);
    // With no accuracy signal the multiplier is 1.0 → rankScore =
    // expectedLift × confidence = 50 × confidenceFromSample(150) = 50 × 0.7
    expect(recs[0].rankScore).toBeCloseTo(50 * 0.7, 5);
  });
});
