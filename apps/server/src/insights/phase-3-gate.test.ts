// ============================================================================
// Phase 3 gate — end-to-end automated walkthrough of the locked Phase 3 loop.
//
// The locked Phase 3 gate from CLAUDE.md:
//
//   Fresh Shopify install → wizard map <5 min → live widget + voice + nudges
//   → live dashboard → first weekly digest email lands.
//
// The wizard / install legs are covered by Phase 1's gate; this file proves
// the data-driven half of the Phase 3 loop end-to-end with `@ava/db` mocked:
//
//   1. Engine: real intervention outcomes → ranked Recommendation rows
//   2. API:    approve → 2-variant Experiment auto-created + linked
//   3. Outcome:treatment-arm wins → RecommendationOutcome with ship + revenue
//   4. Digest: WeeklyDigest reflects approvedThisWeek=1 + decisions.ship=1 +
//              attributedRevenue > 0
//   5. Email:  Renders + dispatches via console adapter (no real send)
//
// Each numbered step has its own `it()` so the gate report reads as a
// linear story when the file runs.
// ============================================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── @ava/db mock — minimal in-memory store the whole loop reads from ───────

interface RecordedRec {
  id: string;
  siteUrl: string;
  frictionId: string;
  interventionType: string;
  actionCode: string;
  payloadTemplate: string;
  rationale: string;
  expectedLiftPct: number;
  confidence: number;
  sampleSizeBasis: number;
  status: string;
  approvedExperimentId: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
}
interface RecordedOutcome {
  id: string;
  recommendationId: string;
  experimentId: string;
  decision: string;
  attributedRevenue: number;
  variantSessions: number;
  controlSessions: number;
  variantConversions: number;
  controlConversions: number;
  conversionDeltaPct: number;
  pValue: number | null;
  createdAt: Date;
}

const store = {
  recommendations: new Map<string, RecordedRec>(),
  outcomes: [] as RecordedOutcome[],
  experimentResults: new Map<string, Array<{
    variantId: string; sessions: number; total: number; converted: number;
    dismissed: number; ignored: number; revenue: number;
  }>>(),
  experiments: new Map<string, { id: string; siteUrl: string | null; status: string; variants: string }>(),
  outcomesByFriction: [] as Array<{ frictionId: string; total: number; converted: number; dismissed: number; ignored: number }>,
  sessionCounts: new Map<string, number>(),
};

let recCounter = 0;
let expCounter = 0;
let outcomeCounter = 0;

vi.mock("@ava/db", () => ({
  InterventionRepo: {
    countOutcomesByFriction: vi.fn(async () => store.outcomesByFriction),
  },
  RecommendationRepo: {
    listBySite: vi.fn(async () => [...store.recommendations.values()]),
    createRecommendation: vi.fn(async (data: Omit<RecordedRec, "id" | "status" | "approvedExperimentId" | "approvedAt" | "rejectedAt" | "rejectedReason" | "createdAt">) => {
      const id = `rec_${++recCounter}`;
      const row: RecordedRec = {
        id, status: "pending", approvedExperimentId: null,
        approvedAt: null, rejectedAt: null, rejectedReason: null,
        createdAt: new Date(),
        ...data,
      };
      store.recommendations.set(id, row);
      return row;
    }),
    getRecommendation: vi.fn(async (id: string) => store.recommendations.get(id) ?? null),
    approve: vi.fn(async (id: string, experimentId: string) => {
      const r = store.recommendations.get(id);
      if (!r) throw new Error("not found");
      r.status = "approved";
      r.approvedExperimentId = experimentId;
      r.approvedAt = new Date();
      return r;
    }),
    // Codex P1 #2 — atomic claim: only flip pending → approved.
    approveIfPending: vi.fn(async (id: string, experimentId: string) => {
      const r = store.recommendations.get(id);
      if (!r || r.status !== "pending") return { count: 0 };
      r.status = "approved";
      r.approvedExperimentId = experimentId;
      r.approvedAt = new Date();
      return { count: 1 };
    }),
    reject: vi.fn(),
  },
  RecommendationOutcomeRepo: {
    createOutcome: vi.fn(async (data: Omit<RecordedOutcome, "id" | "createdAt">) => {
      const row: RecordedOutcome = { id: `out_${++outcomeCounter}`, createdAt: new Date(), ...data };
      store.outcomes.unshift(row); // newest first
      return row;
    }),
    listByRecommendation: vi.fn(async (recId: string) => store.outcomes.filter((o) => o.recommendationId === recId)),
    listRecent: vi.fn(async () => store.outcomes),
  },
  ExperimentRepo: {
    createExperiment: vi.fn(async (data: { name: string; siteUrl: string | null; variants: string }) => {
      const id = `exp_${++expCounter}`;
      const row = { id, siteUrl: data.siteUrl, status: "draft", variants: data.variants };
      store.experiments.set(id, row);
      return row;
    }),
    getExperiment: vi.fn(async (id: string) => store.experiments.get(id) ?? null),
    getActiveExperiment: vi.fn(async () => null),
    startExperiment: vi.fn(async (id: string) => {
      const e = store.experiments.get(id);
      if (!e) throw new Error("not found");
      e.status = "running";
      return e;
    }),
    updateExperiment: vi.fn(),
    endExperiment: vi.fn(async (id: string) => {
      const e = store.experiments.get(id);
      if (e) e.status = "completed";
      return e;
    }),
    // Codex P1 #1: the repo now accepts scope opts (windowStart/windowEnd/frictionId).
    // We don't enforce them in the in-memory mock — the in-memory `experimentResults`
    // map is already pre-scoped per experiment, and the unit test for the repo
    // signature lives in recommendation-outcome.service.test.ts.
    getVariantOutcomesWithRevenue: vi.fn(async (id: string) => store.experimentResults.get(id) ?? []),
  },
  SessionRepo: {
    countByPeriod: vi.fn(async (siteUrl: string, start: Date) => store.sessionCounts.get(`${siteUrl}@${start.getTime()}`) ?? 0),
  },
}));

// ── Imports AFTER the mock ────────────────────────────────────────────────

let generateAndPersist: typeof import("./recommendation-engine.js").generateAndPersist;
let approveRecommendation: typeof import("./recommendation.service.js").approveRecommendation;
let computeOutcomeForRecommendation: typeof import("./recommendation-outcome.service.js").computeOutcomeForRecommendation;
let buildWeeklyDigest: typeof import("./weekly-digest.service.js").buildWeeklyDigest;
let sendDigestEmail: typeof import("./digest-email.service.js").sendDigestEmail;

beforeAll(async () => {
  ({ generateAndPersist } = await import("./recommendation-engine.js"));
  ({ approveRecommendation } = await import("./recommendation.service.js"));
  ({ computeOutcomeForRecommendation } = await import("./recommendation-outcome.service.js"));
  ({ buildWeeklyDigest } = await import("./weekly-digest.service.js"));
  ({ sendDigestEmail } = await import("./digest-email.service.js"));
});

beforeEach(() => {
  store.recommendations.clear();
  store.outcomes.length = 0;
  store.experiments.clear();
  store.experimentResults.clear();
  store.outcomesByFriction.length = 0;
  store.sessionCounts.clear();
  recCounter = 0; expCounter = 0; outcomeCounter = 0;
});

// ── The gate walkthrough ───────────────────────────────────────────────────

const SITE = "https://shop.example";

describe("Phase 3 gate — fresh install → weekly digest email", () => {
  it("step 1: engine emits a Recommendation from underperforming F-code outcomes", async () => {
    // F042 has a curated playbook in sales-playbooks; firing 200x with 2%
    // conversion is the textbook Rule A candidate.
    store.outcomesByFriction.push({
      frictionId: "F042", total: 200, converted: 4, dismissed: 130, ignored: 66,
    });
    const persisted = await generateAndPersist({ siteUrl: SITE });
    expect(persisted).toHaveLength(1);
    const rec = persisted[0] as RecordedRec;
    expect(rec.frictionId).toBe("F042");
    expect(rec.actionCode).toBe("PLAYBOOK_F042");
    expect(rec.status).toBe("pending");
    expect(rec.expectedLiftPct).toBeGreaterThan(0);
  });

  it("step 2: approving the rec auto-creates a 2-variant Experiment and links it", async () => {
    store.outcomesByFriction.push({
      frictionId: "F042", total: 200, converted: 4, dismissed: 130, ignored: 66,
    });
    const [rec] = await generateAndPersist({ siteUrl: SITE });
    const approved = (await approveRecommendation((rec as RecordedRec).id)) as RecordedRec;
    expect(approved.status).toBe("approved");
    expect(approved.approvedExperimentId).toMatch(/^exp_/);
    const exp = store.experiments.get(approved.approvedExperimentId!);
    expect(exp).toBeTruthy();
    const variants = JSON.parse(exp!.variants) as Array<{ id: string; weight: number }>;
    expect(variants.map((v) => v.id).sort()).toEqual(["control", "treatment"]);
    expect(exp!.status).toBe("running"); // auto-start succeeded
  });

  it("step 3: treatment-arm wins → outcome computes ship + attributedRevenue > 0", async () => {
    store.outcomesByFriction.push({
      frictionId: "F042", total: 200, converted: 4, dismissed: 130, ignored: 66,
    });
    const [rec] = await generateAndPersist({ siteUrl: SITE });
    const approved = (await approveRecommendation((rec as RecordedRec).id)) as RecordedRec;
    const expId = approved.approvedExperimentId!;

    // Seed treatment vs control outcomes — large enough sample with a strong
    // positive treatment effect so the z-test trivially clears.
    store.experimentResults.set(expId, [
      { variantId: "control",   sessions: 1000, total: 1000, converted: 50,  dismissed: 0, ignored: 0, revenue: 5000 },
      { variantId: "treatment", sessions: 1000, total: 1000, converted: 150, dismissed: 0, ignored: 0, revenue: 15000 },
    ]);

    const outcome = await computeOutcomeForRecommendation(approved.id);
    expect(outcome.decision).toBe("ship");
    expect(outcome.attributedRevenue).toBe(10000);
    expect(outcome.conversionDeltaPct).toBeGreaterThan(0);
    expect(outcome.significant).toBe(true);
  });

  it("step 4: weekly digest reflects approved=1, ship=1, attributedRevenue > 0", async () => {
    // Reproduce the prior steps to populate the store consistently.
    store.outcomesByFriction.push({
      frictionId: "F042", total: 200, converted: 4, dismissed: 130, ignored: 66,
    });
    const [rec] = await generateAndPersist({ siteUrl: SITE });
    const approved = (await approveRecommendation((rec as RecordedRec).id)) as RecordedRec;
    store.experimentResults.set(approved.approvedExperimentId!, [
      { variantId: "control",   sessions: 1000, total: 1000, converted: 50,  dismissed: 0, ignored: 0, revenue: 5000 },
      { variantId: "treatment", sessions: 1000, total: 1000, converted: 150, dismissed: 0, ignored: 0, revenue: 15000 },
    ]);
    await computeOutcomeForRecommendation(approved.id);

    const digest = await buildWeeklyDigest(SITE);
    expect(digest.recommendations.approvedThisWeek).toBe(1);
    expect(digest.outcomes.decisions.ship).toBe(1);
    expect(digest.outcomes.attributedRevenue).toBe(10000);
    // Top frictions surface the F-code that drove the loop.
    expect(digest.topFrictions[0]?.frictionId).toBe("F042");
  });

  it("step 5: email renders + dispatches via console adapter (no real send)", async () => {
    store.outcomesByFriction.push({
      frictionId: "F042", total: 200, converted: 4, dismissed: 130, ignored: 66,
    });
    const [rec] = await generateAndPersist({ siteUrl: SITE });
    const approved = (await approveRecommendation((rec as RecordedRec).id)) as RecordedRec;
    store.experimentResults.set(approved.approvedExperimentId!, [
      { variantId: "control",   sessions: 1000, total: 1000, converted: 50,  dismissed: 0, ignored: 0, revenue: 5000 },
      { variantId: "treatment", sessions: 1000, total: 1000, converted: 150, dismissed: 0, ignored: 0, revenue: 15000 },
    ]);
    await computeOutcomeForRecommendation(approved.id);

    const result = await sendDigestEmail(SITE, {
      recipient: "owner@shop.example",
      provider: "console", // hard-pin: never use real provider in the gate
    });
    expect(result.delivery.provider).toBe("console");
    expect(result.delivery.recipient).toBe("owner@shop.example");
    // Subject communicates the recovered revenue.
    expect(result.rendered.subject).toContain("$10000.00");
    expect(result.rendered.subject).toContain("1 shipped");
    // HTML body carries the F-code so a merchant can act on the email alone.
    expect(result.rendered.html).toContain("F042");
    // Plain-text fallback is non-empty (some clients render text only).
    expect(result.rendered.text.length).toBeGreaterThan(100);
  });
});
