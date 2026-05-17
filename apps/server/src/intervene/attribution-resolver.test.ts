// ============================================================================
// attribution-resolver — Phase 4.1 unit tests (Codex #4 negative cases).
//
// Asserts the four-condition contract:
//   1. session must have an assignment        → no assignment → null
//   2. experiment must back a recommendation  → unrelated experiment → null
//   3. variant must be "treatment"            → control → null (early-out)
//   4. friction AND action must match         → either mismatch → null
//
// Plus the happy path: all four hold → returns { recommendationId, experimentId }.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { resolveAttribution, type AttributionDeps } from "./attribution-resolver.js";

function deps(over: Partial<AttributionDeps> = {}): AttributionDeps {
  return {
    getAssignmentForSession: vi.fn().mockResolvedValue({ experimentId: "exp_1", variantId: "treatment" }),
    getRecommendationForExperiment: vi.fn().mockResolvedValue({
      id: "rec_1", frictionId: "F042", actionCode: "PLAYBOOK_F042",
    }),
    ...over,
  };
}

const INPUT = { sessionId: "s_1", frictionId: "F042", actionCode: "PLAYBOOK_F042" };

describe("resolveAttribution — happy path", () => {
  it("returns the stamp when all four conditions hold", async () => {
    const result = await resolveAttribution(INPUT, deps());
    expect(result).toEqual({ recommendationId: "rec_1", experimentId: "exp_1" });
  });
});

describe("resolveAttribution — negative cases", () => {
  it("returns null when session has NO assignment", async () => {
    const result = await resolveAttribution(INPUT, deps({
      getAssignmentForSession: vi.fn().mockResolvedValue(null),
    }));
    expect(result).toBeNull();
  });

  it("returns null when assigned variant is 'control' (early-out, never queries rec)", async () => {
    const getRec = vi.fn();
    const result = await resolveAttribution(INPUT, deps({
      getAssignmentForSession: vi.fn().mockResolvedValue({ experimentId: "exp_1", variantId: "control" }),
      getRecommendationForExperiment: getRec,
    }));
    expect(result).toBeNull();
    // Early-out optimization: control arm must not trigger a rec lookup.
    expect(getRec).not.toHaveBeenCalled();
  });

  it("returns null for any non-treatment variant (e.g. 'variant_c')", async () => {
    const result = await resolveAttribution(INPUT, deps({
      getAssignmentForSession: vi.fn().mockResolvedValue({ experimentId: "exp_1", variantId: "variant_c" }),
    }));
    expect(result).toBeNull();
  });

  it("returns null when experiment is NOT backed by a recommendation (legacy/manual A/B)", async () => {
    const result = await resolveAttribution(INPUT, deps({
      getRecommendationForExperiment: vi.fn().mockResolvedValue(null),
    }));
    expect(result).toBeNull();
  });

  it("returns null when fired frictionId differs from recommendation's", async () => {
    const result = await resolveAttribution(
      { ...INPUT, frictionId: "F999" }, // unrelated friction firing in same session
      deps(),
    );
    expect(result).toBeNull();
  });

  it("returns null when fired actionCode differs from recommendation's", async () => {
    const result = await resolveAttribution(
      { ...INPUT, actionCode: "FALLBACK_GENERIC" }, // legacy fallback path
      deps(),
    );
    expect(result).toBeNull();
  });
});
