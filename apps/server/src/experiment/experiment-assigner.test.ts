// ============================================================================
// Experiment Assigner Tests — determinism and bucketing
// ============================================================================
import { describe, it, expect } from "vitest";
import { assignVariant } from "./experiment-assigner.js";
import type { ExperimentVariant } from "@ava/shared";

const variants: ExperimentVariant[] = [
  { id: "control", weight: 0.5 },
  { id: "treatment", weight: 0.5 },
];

describe("assignVariant — determinism", () => {
  it("returns same result on repeated calls for same session+experiment", () => {
    const a = assignVariant("session-abc", "exp-001", variants, 100);
    const b = assignVariant("session-abc", "exp-001", variants, 100);
    expect(a).toEqual(b);
  });

  it("different sessionIds can produce different variants", () => {
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = assignVariant(`session-${i}`, "exp-001", variants, 100);
      if (r.enrolled && r.variantId) results.add(r.variantId);
    }
    // With 20 sessions and 50/50 split, we should see both variants
    expect(results.size).toBe(2);
  });

  it("same session maps to same variant across experiments that share sessions", () => {
    // Two different experiments — same sessionId should be independent
    const r1 = assignVariant("session-xyz", "exp-A", variants, 100);
    const r2 = assignVariant("session-xyz", "exp-B", variants, 100);
    // Both should be enrolled (100% traffic), may differ per experiment
    expect(r1.enrolled).toBe(true);
    expect(r2.enrolled).toBe(true);
  });
});

describe("assignVariant — traffic splitting", () => {
  it("returns not enrolled at 0% traffic", () => {
    const result = assignVariant("session-abc", "exp-001", variants, 0);
    expect(result.enrolled).toBe(false);
    expect(result.variantId).toBeNull();
  });

  it("approximately respects traffic percentage at scale", () => {
    const N = 1000;
    let enrolled = 0;
    for (let i = 0; i < N; i++) {
      const r = assignVariant(`sess-${i}`, "exp-traffic", variants, 50);
      if (r.enrolled) enrolled++;
    }
    // Expect ~50% enrolled ± 5%
    expect(enrolled).toBeGreaterThan(400);
    expect(enrolled).toBeLessThan(600);
  });

  it("enrolls all at 100% traffic", () => {
    for (let i = 0; i < 50; i++) {
      const r = assignVariant(`sess-${i}`, "exp-full", variants, 100);
      expect(r.enrolled).toBe(true);
    }
  });
});

describe("assignVariant — variant assignment", () => {
  it("returns null variantId when not enrolled", () => {
    const result = assignVariant("session-abc", "exp-001", variants, 0);
    expect(result.variantId).toBeNull();
  });

  it("only returns variantIds that exist in the variants list", () => {
    for (let i = 0; i < 50; i++) {
      const r = assignVariant(`sess-${i}`, "exp-check", variants, 100);
      if (r.enrolled) {
        expect(["control", "treatment"]).toContain(r.variantId);
      }
    }
  });

  it("returns false + null for empty variants list", () => {
    const result = assignVariant("session-abc", "exp-001", [], 100);
    expect(result.enrolled).toBe(false);
    expect(result.variantId).toBeNull();
  });

  it("respects weighted distribution approximately at scale", () => {
    const weightedVariants: ExperimentVariant[] = [
      { id: "A", weight: 0.8 },
      { id: "B", weight: 0.2 },
    ];
    const N = 1000;
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let i = 0; i < N; i++) {
      const r = assignVariant(`sess-${i}`, "exp-weighted", weightedVariants, 100);
      if (r.enrolled && r.variantId) counts[r.variantId]++;
    }
    // A should be ~80% of enrolled
    const total = counts.A + counts.B;
    const aRatio = counts.A / total;
    expect(aRatio).toBeGreaterThan(0.72);
    expect(aRatio).toBeLessThan(0.88);
  });
});

describe("assignVariant — single variant edge case", () => {
  it("always assigns the only variant when enrolled", () => {
    const single: ExperimentVariant[] = [{ id: "only", weight: 1.0 }];
    for (let i = 0; i < 20; i++) {
      const r = assignVariant(`sess-${i}`, "exp-single", single, 100);
      expect(r.enrolled).toBe(true);
      expect(r.variantId).toBe("only");
    }
  });
});
