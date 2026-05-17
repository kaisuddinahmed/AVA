// ============================================================================
// recommendation.service — Phase 3.2 unit tests.
//
// Asserts the approval pipeline:
//   approve  → creates Experiment, links it, flips status, auto-starts
//   reject   → status=rejected with reason
//   approve  → idempotent on already-approved
//   approve  → rejects non-pending statuses (rejected/archived)
//   start failure leaves Recommendation approved but Experiment in draft
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const getRec = vi.fn();
const approveRec = vi.fn();
const approveIfPending = vi.fn();
const rejectRec = vi.fn();

vi.mock("@ava/db", () => ({
  RecommendationRepo: {
    getRecommendation: (...args: unknown[]) => getRec(...args),
    approve: (...args: unknown[]) => approveRec(...args),
    approveIfPending: (...args: unknown[]) => approveIfPending(...args),
    reject: (...args: unknown[]) => rejectRec(...args),
  },
}));

const createExperiment = vi.fn();
const startExperiment = vi.fn();
const endExperiment = vi.fn();
const getExperiment = vi.fn();

vi.mock("../experiment/experiment.service.js", () => ({
  createExperiment: (...args: unknown[]) => createExperiment(...args),
  startExperiment: (...args: unknown[]) => startExperiment(...args),
  endExperiment: (...args: unknown[]) => endExperiment(...args),
  getExperiment: (...args: unknown[]) => getExperiment(...args),
}));

const generateAndPersist = vi.fn();
vi.mock("./recommendation-engine.js", () => ({
  generateAndPersist: (...args: unknown[]) => generateAndPersist(...args),
}));

import {
  approveRecommendation,
  rejectRecommendation,
  regenerateForSite,
  getWithExperiment,
} from "./recommendation.service.js";

function pendingRec(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rec_1",
    siteUrl: "https://x",
    frictionId: "F042",
    interventionType: "active",
    actionCode: "PLAYBOOK_F042",
    payloadTemplate: '{"voice_script":"hi"}',
    rationale: "F042 underperforming",
    expectedLiftPct: 50,
    confidence: 0.7,
    sampleSizeBasis: 100,
    status: "pending",
    approvedExperimentId: null,
    ...over,
  };
}

beforeEach(() => {
  getRec.mockReset();
  approveRec.mockReset();
  approveIfPending.mockReset().mockResolvedValue({ count: 1 }); // default: claim wins
  rejectRec.mockReset();
  createExperiment.mockReset();
  startExperiment.mockReset();
  endExperiment.mockReset();
  getExperiment.mockReset();
  generateAndPersist.mockReset();
});

// ── Approve ────────────────────────────────────────────────────────────────

describe("approveRecommendation", () => {
  it("creates a 2-variant Experiment, links it, flips status, auto-starts", async () => {
    // Pre-claim: pending. Post-claim re-fetch: approved.
    getRec
      .mockResolvedValueOnce(pendingRec())
      .mockResolvedValueOnce({ ...pendingRec(), status: "approved", approvedExperimentId: "exp_1" });
    createExperiment.mockResolvedValue({ id: "exp_1", name: "Rec F042 → PLAYBOOK_F042" });
    startExperiment.mockResolvedValue({ id: "exp_1", status: "running" });

    const result = await approveRecommendation("rec_1");

    expect(createExperiment).toHaveBeenCalledTimes(1);
    const expArgs = createExperiment.mock.calls[0]![0] as { variants: Array<{ id: string; weight: number }>; siteUrl: string };
    expect(expArgs.variants).toHaveLength(2);
    expect(expArgs.variants[0]!.id).toBe("control");
    expect(expArgs.variants[1]!.id).toBe("treatment");
    expect(expArgs.variants[0]!.weight + expArgs.variants[1]!.weight).toBeCloseTo(1.0);
    expect(expArgs.siteUrl).toBe("https://x");

    expect(approveIfPending).toHaveBeenCalledWith("rec_1", "exp_1");
    expect(startExperiment).toHaveBeenCalledWith("exp_1");
    expect(result.status).toBe("approved");
    expect(result.approvedExperimentId).toBe("exp_1");
  });

  it("is idempotent on already-approved (no second Experiment created)", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "approved", approvedExperimentId: "exp_prev" }));
    const result = await approveRecommendation("rec_1");
    expect(createExperiment).not.toHaveBeenCalled();
    expect(approveIfPending).not.toHaveBeenCalled();
    expect(result.status).toBe("approved");
  });

  it("is idempotent on already-active", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "active", approvedExperimentId: "exp_prev" }));
    const result = await approveRecommendation("rec_1");
    expect(createExperiment).not.toHaveBeenCalled();
    expect(approveIfPending).not.toHaveBeenCalled();
    expect(result.status).toBe("active");
  });

  it("throws on non-pending statuses (rejected / archived)", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "rejected" }));
    await expect(approveRecommendation("rec_1")).rejects.toThrow(/Cannot approve/);

    getRec.mockResolvedValue(pendingRec({ status: "archived" }));
    await expect(approveRecommendation("rec_1")).rejects.toThrow(/Cannot approve/);
  });

  it("throws when recommendation is not found", async () => {
    getRec.mockResolvedValue(null);
    await expect(approveRecommendation("rec_missing")).rejects.toThrow(/not found/);
  });

  it("autoStart=false skips startExperiment", async () => {
    getRec
      .mockResolvedValueOnce(pendingRec())
      .mockResolvedValueOnce({ ...pendingRec(), status: "approved" });
    createExperiment.mockResolvedValue({ id: "exp_1" });

    await approveRecommendation("rec_1", { autoStart: false });

    expect(createExperiment).toHaveBeenCalled();
    expect(startExperiment).not.toHaveBeenCalled();
  });

  it("startExperiment failure leaves Recommendation approved (does not throw)", async () => {
    getRec
      .mockResolvedValueOnce(pendingRec())
      .mockResolvedValueOnce({ ...pendingRec(), status: "approved", approvedExperimentId: "exp_1" });
    createExperiment.mockResolvedValue({ id: "exp_1" });
    startExperiment.mockRejectedValue(new Error("Another experiment is already running"));

    const result = await approveRecommendation("rec_1");
    expect(result.status).toBe("approved");
    expect(result.approvedExperimentId).toBe("exp_1");
  });

  // ── Codex P1 #2 — atomic approve under concurrent calls ────────────────

  it("approve race lost (approveIfPending count=0) cleans up orphan experiment + returns existing approved row", async () => {
    // Two concurrent calls both see pending. First call wins (count=1),
    // second call sees count=0 and must end its orphan experiment.
    getRec
      .mockResolvedValueOnce(pendingRec())              // pre-claim read
      .mockResolvedValueOnce({                          // post-claim re-fetch on losing side
        ...pendingRec(),
        status: "approved",
        approvedExperimentId: "exp_winner",
      });
    createExperiment.mockResolvedValue({ id: "exp_loser" }); // this caller's orphan
    approveIfPending.mockResolvedValue({ count: 0 });       // claim lost
    endExperiment.mockResolvedValue({});

    const result = await approveRecommendation("rec_1");

    expect(createExperiment).toHaveBeenCalledTimes(1);
    expect(approveIfPending).toHaveBeenCalledWith("rec_1", "exp_loser");
    expect(endExperiment).toHaveBeenCalledWith("exp_loser");
    expect(startExperiment).not.toHaveBeenCalled(); // never start the orphan
    expect(result.approvedExperimentId).toBe("exp_winner");
    expect(result.status).toBe("approved");
  });

  it("orphan cleanup failure does not throw (swallowed and logged)", async () => {
    getRec
      .mockResolvedValueOnce(pendingRec())
      .mockResolvedValueOnce({ ...pendingRec(), status: "approved", approvedExperimentId: "exp_winner" });
    createExperiment.mockResolvedValue({ id: "exp_loser" });
    approveIfPending.mockResolvedValue({ count: 0 });
    endExperiment.mockRejectedValue(new Error("transient failure"));

    const result = await approveRecommendation("rec_1");
    expect(result.approvedExperimentId).toBe("exp_winner");
  });
});

// ── Reject ─────────────────────────────────────────────────────────────────

describe("rejectRecommendation", () => {
  it("sets status=rejected with the supplied reason", async () => {
    getRec.mockResolvedValue(pendingRec());
    rejectRec.mockResolvedValue({ ...pendingRec(), status: "rejected", rejectedReason: "wrong friction" });

    const result = await rejectRecommendation("rec_1", { reason: "wrong friction" });
    expect(rejectRec).toHaveBeenCalledWith("rec_1", "wrong friction");
    expect(result.status).toBe("rejected");
  });

  it("is idempotent on already-rejected", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "rejected" }));
    const result = await rejectRecommendation("rec_1", { reason: "x" });
    expect(rejectRec).not.toHaveBeenCalled();
    expect(result.status).toBe("rejected");
  });

  it("throws when reason is blank", async () => {
    getRec.mockResolvedValue(pendingRec());
    await expect(rejectRecommendation("rec_1", { reason: "   " })).rejects.toThrow(/reason/i);
  });

  it("throws on non-pending statuses (approved / active)", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "approved" }));
    await expect(rejectRecommendation("rec_1", { reason: "no" })).rejects.toThrow(/Cannot reject/);
  });
});

// ── Regenerate ─────────────────────────────────────────────────────────────

describe("regenerateForSite", () => {
  it("delegates to generateAndPersist and returns the persisted rows", async () => {
    const rows = [{ id: "r1" }, { id: "r2" }];
    generateAndPersist.mockResolvedValue(rows);
    const result = await regenerateForSite({ siteUrl: "https://x", windowDays: 7 });
    expect(generateAndPersist).toHaveBeenCalledWith({ siteUrl: "https://x", windowDays: 7 });
    expect(result).toEqual(rows);
  });
});

// ── Get with experiment ────────────────────────────────────────────────────

describe("getWithExperiment", () => {
  it("returns null when the recommendation does not exist", async () => {
    getRec.mockResolvedValue(null);
    expect(await getWithExperiment("missing")).toBeNull();
  });

  it("returns rec with experiment=null when not yet approved", async () => {
    getRec.mockResolvedValue(pendingRec());
    const result = await getWithExperiment("rec_1");
    expect(result!.experiment).toBeNull();
    expect(getExperiment).not.toHaveBeenCalled();
  });

  it("fetches and attaches the linked experiment when approvedExperimentId is set", async () => {
    getRec.mockResolvedValue(pendingRec({ status: "approved", approvedExperimentId: "exp_1" }));
    getExperiment.mockResolvedValue({ id: "exp_1", status: "running" });
    const result = await getWithExperiment("rec_1");
    expect(getExperiment).toHaveBeenCalledWith("exp_1");
    expect(result!.experiment).toMatchObject({ id: "exp_1", status: "running" });
  });
});
