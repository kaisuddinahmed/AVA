// ============================================================================
// recommendation-outcome.service — Phase 3.4 unit tests.
//
// Asserts:
//   - decision matrix (ship/rollback/extend/inconclusive)
//   - attributedRevenue clamped at 0
//   - persists a RecommendationOutcome row when persist!=false
//   - persist=false returns the computed result without writing
//   - throws when recommendation missing or unlinked
//   - summaryForSite filters to approved/active + attaches latest outcome
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const getRec = vi.fn();
const listBySite = vi.fn();
const createOutcome = vi.fn();
const listOutcomesRepo = vi.fn();
const getVariantOutcomesWithRevenue = vi.fn();

vi.mock("@ava/db", () => ({
  RecommendationRepo: {
    getRecommendation: (...args: unknown[]) => getRec(...args),
    listBySite: (...args: unknown[]) => listBySite(...args),
  },
  RecommendationOutcomeRepo: {
    createOutcome: (...args: unknown[]) => createOutcome(...args),
    listByRecommendation: (...args: unknown[]) => listOutcomesRepo(...args),
  },
  ExperimentRepo: {
    getVariantOutcomesWithRevenue: (...args: unknown[]) => getVariantOutcomesWithRevenue(...args),
  },
}));

import {
  computeOutcomeForRecommendation,
  listOutcomes,
  summaryForSite,
} from "./recommendation-outcome.service.js";

function approvedRec(over: Record<string, unknown> = {}) {
  return {
    id: "rec_1",
    siteUrl: "https://x",
    frictionId: "F042",
    status: "approved",
    approvedExperimentId: "exp_1",
    approvedAt: new Date("2026-05-01T00:00:00Z"),
    createdAt: new Date("2026-04-30T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  getRec.mockReset();
  listBySite.mockReset();
  createOutcome.mockReset().mockImplementation(async (data: unknown) => ({ id: "out_x", ...(data as object) }));
  listOutcomesRepo.mockReset().mockResolvedValue([]);
  getVariantOutcomesWithRevenue.mockReset();
});

// ── Decision matrix ────────────────────────────────────────────────────────

describe("decision matrix", () => {
  it("inconclusive when sample size below threshold", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 10, total: 10, converted: 1, dismissed: 0, ignored: 0, revenue: 50 },
      { variantId: "treatment", sessions: 10, total: 10, converted: 2, dismissed: 0, ignored: 0, revenue: 120 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.decision).toBe("inconclusive");
  });

  it("ship when significant + positive uplift + sufficient sample", async () => {
    getRec.mockResolvedValue(approvedRec());
    // Large samples with big CR gap → z-test trivially significant.
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 1000, total: 1000, converted: 50, dismissed: 0, ignored: 0, revenue: 5000 },
      { variantId: "treatment", sessions: 1000, total: 1000, converted: 150, dismissed: 0, ignored: 0, revenue: 15000 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.decision).toBe("ship");
    expect(r.significant).toBe(true);
    expect(r.conversionDeltaPct).toBeGreaterThan(0);
  });

  it("rollback when significant + negative uplift", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 1000, total: 1000, converted: 150, dismissed: 0, ignored: 0, revenue: 15000 },
      { variantId: "treatment", sessions: 1000, total: 1000, converted: 50, dismissed: 0, ignored: 0, revenue: 5000 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.decision).toBe("rollback");
    expect(r.conversionDeltaPct).toBeLessThan(0);
  });

  it("extend when not significant but positive trend", async () => {
    getRec.mockResolvedValue(approvedRec());
    // Slim, non-significant lift above the sample-size floor.
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 100, total: 100, converted: 10, dismissed: 0, ignored: 0, revenue: 100 },
      { variantId: "treatment", sessions: 100, total: 100, converted: 12, dismissed: 0, ignored: 0, revenue: 120 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.significant).toBe(false);
    expect(r.decision).toBe("extend");
  });

  it("inconclusive when not significant + negative trend (sample big enough)", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 100, total: 100, converted: 12, dismissed: 0, ignored: 0, revenue: 120 },
      { variantId: "treatment", sessions: 100, total: 100, converted: 10, dismissed: 0, ignored: 0, revenue: 100 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.significant).toBe(false);
    expect(r.decision).toBe("inconclusive");
  });
});

// ── Revenue attribution ────────────────────────────────────────────────────

describe("attributedRevenue", () => {
  it("equals treatmentRevenue - controlRevenue when treatment > control", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 200, total: 200, converted: 20, dismissed: 0, ignored: 0, revenue: 1000 },
      { variantId: "treatment", sessions: 200, total: 200, converted: 30, dismissed: 0, ignored: 0, revenue: 1750 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.attributedRevenue).toBe(750);
  });

  it("clamps to 0 when treatment revenue is lower (negative attribution)", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 200, total: 200, converted: 30, dismissed: 0, ignored: 0, revenue: 1500 },
      { variantId: "treatment", sessions: 200, total: 200, converted: 20, dismissed: 0, ignored: 0, revenue: 900 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.attributedRevenue).toBe(0);
  });
});

// ── Persistence ────────────────────────────────────────────────────────────

describe("persistence", () => {
  it("creates a RecommendationOutcome row by default", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([
      { variantId: "control", sessions: 500, total: 500, converted: 25, dismissed: 0, ignored: 0, revenue: 2500 },
      { variantId: "treatment", sessions: 500, total: 500, converted: 50, dismissed: 0, ignored: 0, revenue: 5500 },
    ]);
    const r = await computeOutcomeForRecommendation("rec_1");
    expect(createOutcome).toHaveBeenCalledTimes(1);
    const arg = createOutcome.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.recommendationId).toBe("rec_1");
    expect(arg.experimentId).toBe("exp_1");
    expect(arg.variantSessions).toBe(500);
    expect(arg.controlSessions).toBe(500);
    expect(arg.attributedRevenue).toBe(3000);
    expect(r.outcomeId).toBe("out_x");
  });

  it("skips persistence when persist=false", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([]);
    await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(createOutcome).not.toHaveBeenCalled();
  });
});

// ── Error paths ────────────────────────────────────────────────────────────

describe("scoping (Codex P1)", () => {
  it("forwards windowStart + windowEnd + frictionId + recommendationId to the repo query", async () => {
    getRec.mockResolvedValue(approvedRec({
      id: "rec_1",
      frictionId: "F042",
      approvedAt: new Date("2026-05-10T00:00:00Z"),
    }));
    getVariantOutcomesWithRevenue.mockResolvedValue([]);
    const now = new Date("2026-05-17T00:00:00Z");
    await computeOutcomeForRecommendation("rec_1", { windowEnd: now, persist: false });
    expect(getVariantOutcomesWithRevenue).toHaveBeenCalledTimes(1);
    const [experimentId, scope] = getVariantOutcomesWithRevenue.mock.calls[0]!;
    expect(experimentId).toBe("exp_1");
    expect(scope).toMatchObject({
      frictionId: "F042",
      windowEnd: now,
      // Phase 4.1 — direct attribution key prefers the FK over the heuristic.
      recommendationId: "rec_1",
    });
    expect((scope as { windowStart: Date }).windowStart.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });

  it("defaults windowStart to createdAt when approvedAt is missing", async () => {
    getRec.mockResolvedValue(approvedRec({
      approvedAt: null,
      createdAt: new Date("2026-04-30T00:00:00Z"),
    }));
    getVariantOutcomesWithRevenue.mockResolvedValue([]);
    await computeOutcomeForRecommendation("rec_1", { persist: false });
    const [, scope] = getVariantOutcomesWithRevenue.mock.calls[0]!;
    expect((scope as { windowStart: Date }).windowStart.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });
});

describe("error paths", () => {
  it("throws when recommendation not found", async () => {
    getRec.mockResolvedValue(null);
    await expect(computeOutcomeForRecommendation("missing")).rejects.toThrow(/not found/);
  });

  it("throws when recommendation has no linked experiment", async () => {
    getRec.mockResolvedValue(approvedRec({ approvedExperimentId: null, status: "pending" }));
    await expect(computeOutcomeForRecommendation("rec_1")).rejects.toThrow(/no linked Experiment/);
  });

  it("handles empty variant outcomes (no assignments yet) as inconclusive", async () => {
    getRec.mockResolvedValue(approvedRec());
    getVariantOutcomesWithRevenue.mockResolvedValue([]);
    const r = await computeOutcomeForRecommendation("rec_1", { persist: false });
    expect(r.decision).toBe("inconclusive");
    expect(r.attributedRevenue).toBe(0);
    expect(r.variantSessions).toBe(0);
    expect(r.controlSessions).toBe(0);
  });
});

// ── Listing + summary ──────────────────────────────────────────────────────

describe("listOutcomes", () => {
  it("delegates to the repo", async () => {
    listOutcomesRepo.mockResolvedValue([{ id: "o1" }]);
    const r = await listOutcomes("rec_1");
    expect(listOutcomesRepo).toHaveBeenCalledWith("rec_1");
    expect(r).toEqual([{ id: "o1" }]);
  });
});

describe("summaryForSite", () => {
  it("scopes the repo query to approved/active statuses (Codex P2 #3)", async () => {
    listBySite.mockResolvedValue([
      { id: "r_approved", status: "approved" },
      { id: "r_active",   status: "active"   },
    ]);
    listOutcomesRepo.mockImplementation(async (recId: string) => {
      if (recId === "r_approved") return [{ id: "o_latest" }, { id: "o_old" }];
      return [];
    });

    const result = await summaryForSite("https://x");

    // Repo received the multi-status filter — no post-fetch JS filter relied upon.
    expect(listBySite).toHaveBeenCalledTimes(1);
    const [siteUrl, opts] = listBySite.mock.calls[0]!;
    expect(siteUrl).toBe("https://x");
    expect(opts).toMatchObject({ statuses: ["approved", "active"] });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["r_active", "r_approved"]);
    const approved = result.find((r) => r.id === "r_approved")!;
    expect(approved.latestOutcome).toMatchObject({ id: "o_latest" });
    const active = result.find((r) => r.id === "r_active")!;
    expect(active.latestOutcome).toBeNull();
  });

  it("regression: an old approved rec survives a flood of newer pending rows (Codex P2 #3)", async () => {
    // Simulate the repo correctly applying the statuses filter — only the
    // approved row comes back. (Pre-fix, the repo returned everything and JS
    // filtered after, so the approved row could be dropped by the 50-row
    // window when 100 newer pending rows existed.)
    listBySite.mockResolvedValue([
      { id: "r_old_approved", status: "approved", createdAt: new Date("2026-01-01") },
    ]);
    listOutcomesRepo.mockResolvedValue([]);
    const result = await summaryForSite("https://x");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("r_old_approved");
  });

  it("forwards the limit option through to the repo", async () => {
    listBySite.mockResolvedValue([]);
    await summaryForSite("https://x", 200);
    expect(listBySite.mock.calls[0]![1]).toMatchObject({ limit: 200 });
  });
});
