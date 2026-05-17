// ============================================================================
// weekly-digest.service — Phase 3.6 unit tests.
//
// All repos mocked. Asserts:
//   - period math (start = now - windowDays)
//   - approved/rejected/pending tallies use the right timestamps + statuses
//   - outcomes filtered to this site only (cross-site outcomes ignored)
//   - decision tally + attributedRevenue sum
//   - WoW delta math + the prior==0 fallback
//   - top frictions sorted by `total` descending and capped at limit
//   - empty-data path returns sensible zeros
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const countByPeriod = vi.fn();
const listBySite = vi.fn();
const listRecentOutcomes = vi.fn();
const countOutcomesByFriction = vi.fn();

vi.mock("@ava/db", () => ({
  SessionRepo: { countByPeriod: (...args: unknown[]) => countByPeriod(...args) },
  RecommendationRepo: { listBySite: (...args: unknown[]) => listBySite(...args) },
  RecommendationOutcomeRepo: { listRecent: (...args: unknown[]) => listRecentOutcomes(...args) },
  InterventionRepo: { countOutcomesByFriction: (...args: unknown[]) => countOutcomesByFriction(...args) },
}));

import { buildWeeklyDigest } from "./weekly-digest.service.js";

const NOW = new Date("2026-05-17T00:00:00Z");
const WEEK_AGO = new Date("2026-05-10T00:00:00Z");
const TWO_WEEKS_AGO = new Date("2026-05-03T00:00:00Z");

beforeEach(() => {
  countByPeriod.mockReset();
  listBySite.mockReset().mockResolvedValue([]);
  listRecentOutcomes.mockReset().mockResolvedValue([]);
  countOutcomesByFriction.mockReset().mockResolvedValue([]);
});

// ── Period + WoW ───────────────────────────────────────────────────────────

describe("period + WoW", () => {
  it("computes window math with default windowDays=7", async () => {
    countByPeriod.mockResolvedValue(100);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.period.days).toBe(7);
    expect(d.period.end.toISOString()).toBe(NOW.toISOString());
    expect(d.period.start.toISOString()).toBe(WEEK_AGO.toISOString());
    // Two countByPeriod calls — current + prior windows.
    expect(countByPeriod).toHaveBeenCalledTimes(2);
    const firstCall = countByPeriod.mock.calls[0]!;
    expect((firstCall[1] as Date).toISOString()).toBe(WEEK_AGO.toISOString());
    const secondCall = countByPeriod.mock.calls[1]!;
    expect((secondCall[1] as Date).toISOString()).toBe(TWO_WEEKS_AGO.toISOString());
    expect((secondCall[2] as Date).toISOString()).toBe(WEEK_AGO.toISOString());
  });

  it("computes WoW delta as percent", async () => {
    countByPeriod.mockResolvedValueOnce(150).mockResolvedValueOnce(100);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.traffic.sessions).toBe(150);
    expect(d.traffic.sessionsPrior).toBe(100);
    expect(d.traffic.wowDeltaPct).toBe(50);
  });

  it("WoW delta returns null when prior is 0 and current > 0 (no baseline)", async () => {
    countByPeriod.mockResolvedValueOnce(50).mockResolvedValueOnce(0);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.traffic.wowDeltaPct).toBeNull();
  });

  it("WoW delta = 0 when both periods are empty", async () => {
    countByPeriod.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.traffic.wowDeltaPct).toBe(0);
  });
});

// ── Recommendations counts ─────────────────────────────────────────────────

describe("recommendations counts", () => {
  it("counts approved/rejected only in window; pending/active are 'now' totals", async () => {
    countByPeriod.mockResolvedValue(0);
    listBySite.mockResolvedValue([
      // approved IN window
      { id: "r1", status: "approved", approvedAt: new Date("2026-05-14T00:00:00Z"), rejectedAt: null, createdAt: new Date("2026-05-13") },
      // approved BEFORE window → excluded
      { id: "r2", status: "approved", approvedAt: new Date("2026-05-01T00:00:00Z"), rejectedAt: null, createdAt: new Date("2026-05-01") },
      // rejected IN window
      { id: "r3", status: "rejected", approvedAt: null, rejectedAt: new Date("2026-05-15T00:00:00Z"), createdAt: new Date("2026-05-12") },
      // pending now (timestamp irrelevant for pending/active tallies)
      { id: "r4", status: "pending", approvedAt: null, rejectedAt: null, createdAt: new Date("2026-05-15") },
      { id: "r5", status: "pending", approvedAt: null, rejectedAt: null, createdAt: new Date("2026-04-01") },
      // active now
      { id: "r6", status: "active",  approvedAt: new Date("2026-05-12T00:00:00Z"), rejectedAt: null, createdAt: new Date("2026-05-12") },
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.recommendations).toEqual({
      approvedThisWeek: 1,
      rejectedThisWeek: 1,
      pendingNow: 2,
      activeNow: 1,
    });
  });
});

// ── Outcomes ───────────────────────────────────────────────────────────────

describe("outcomes", () => {
  it("filters outcomes to this site only (cross-site ignored)", async () => {
    countByPeriod.mockResolvedValue(0);
    listBySite.mockResolvedValue([
      { id: "r_self", status: "active", approvedAt: null, rejectedAt: null, createdAt: new Date("2026-05-10") },
    ]);
    listRecentOutcomes.mockResolvedValue([
      { recommendationId: "r_self", decision: "ship",       attributedRevenue: 500 },
      { recommendationId: "r_other", decision: "rollback",  attributedRevenue: 999 }, // other site
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.outcomes.snapshotsThisWeek).toBe(1);
    expect(d.outcomes.attributedRevenue).toBe(500);
    expect(d.outcomes.decisions).toEqual({ ship: 1, rollback: 0, extend: 0, inconclusive: 0, total: 1 });
  });

  it("aggregates decisions tally + attributedRevenue across multiple snapshots", async () => {
    countByPeriod.mockResolvedValue(0);
    listBySite.mockResolvedValue([
      { id: "r1", status: "active",   approvedAt: null, rejectedAt: null, createdAt: new Date("2026-05-10") },
      { id: "r2", status: "approved", approvedAt: null, rejectedAt: null, createdAt: new Date("2026-05-10") },
    ]);
    listRecentOutcomes.mockResolvedValue([
      { recommendationId: "r1", decision: "ship",         attributedRevenue: 1000 },
      { recommendationId: "r1", decision: "extend",       attributedRevenue: 200  },
      { recommendationId: "r2", decision: "rollback",     attributedRevenue: 0    },
      { recommendationId: "r2", decision: "inconclusive", attributedRevenue: 50   },
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.outcomes).toEqual({
      snapshotsThisWeek: 4,
      decisions: { ship: 1, rollback: 1, extend: 1, inconclusive: 1, total: 4 },
      attributedRevenue: 1250,
    });
  });

  it("null decisions default to 'inconclusive' bucket", async () => {
    countByPeriod.mockResolvedValue(0);
    listBySite.mockResolvedValue([{ id: "r1", status: "active", approvedAt: null, rejectedAt: null, createdAt: new Date("2026-05-10") }]);
    listRecentOutcomes.mockResolvedValue([
      { recommendationId: "r1", decision: null, attributedRevenue: 0 },
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.outcomes.decisions.inconclusive).toBe(1);
  });
});

// ── Top frictions ──────────────────────────────────────────────────────────

describe("top frictions", () => {
  it("sorts by total desc and caps at the limit", async () => {
    countByPeriod.mockResolvedValue(0);
    countOutcomesByFriction.mockResolvedValue([
      { frictionId: "F003", total: 30, converted: 5, dismissed: 10, ignored: 15 },
      { frictionId: "F001", total: 100, converted: 10, dismissed: 50, ignored: 40 },
      { frictionId: "F002", total: 60, converted: 5, dismissed: 30, ignored: 25 },
      { frictionId: "F004", total: 10, converted: 1, dismissed: 5, ignored: 4 },
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW, topFrictionsLimit: 2 });
    expect(d.topFrictions.map((f) => f.frictionId)).toEqual(["F001", "F002"]);
    expect(d.topFrictions[0]!.conversionRate).toBeCloseTo(0.1);
    expect(d.topFrictions[0]!.dismissalRate).toBeCloseTo(0.5);
  });

  it("returns zero-rates without dividing by zero on empty frictions", async () => {
    countByPeriod.mockResolvedValue(0);
    countOutcomesByFriction.mockResolvedValue([
      { frictionId: "F999", total: 0, converted: 0, dismissed: 0, ignored: 0 },
    ]);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.topFrictions[0]!.conversionRate).toBe(0);
    expect(d.topFrictions[0]!.dismissalRate).toBe(0);
  });
});

// ── Empty-data smoke ───────────────────────────────────────────────────────

describe("empty-data smoke", () => {
  it("returns sensible zeros when nothing is in the window", async () => {
    countByPeriod.mockResolvedValue(0);
    const d = await buildWeeklyDigest("https://x", { now: NOW });
    expect(d.traffic.sessions).toBe(0);
    expect(d.recommendations).toEqual({ approvedThisWeek: 0, rejectedThisWeek: 0, pendingNow: 0, activeNow: 0 });
    expect(d.outcomes).toEqual({ snapshotsThisWeek: 0, decisions: { ship: 0, rollback: 0, extend: 0, inconclusive: 0, total: 0 }, attributedRevenue: 0 });
    expect(d.topFrictions).toEqual([]);
  });
});
