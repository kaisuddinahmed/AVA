// ============================================================================
// MSWIM composite scorer — smoke test for the @ava/shared test harness.
// Real coverage of MSWIM lives in apps/server (signal calculators).
// ============================================================================

import { describe, it, expect } from "vitest";
import { computeComposite } from "./mswim.js";

describe("mswim.computeComposite (smoke)", () => {
  it("applies weighted sum across all five signals", () => {
    const composite = computeComposite(
      { intent: 100, friction: 100, clarity: 100, receptivity: 100, value: 100 },
      { intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.2, value: 0.15 },
    );
    // Weights sum to 1.0, signals all 100 → composite = 100
    expect(composite).toBe(100);
  });

  it("clamps negative signal contributions to a 0–100 result", () => {
    const composite = computeComposite(
      { intent: 0, friction: 0, clarity: 0, receptivity: 0, value: 0 },
      { intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.2, value: 0.15 },
    );
    expect(composite).toBe(0);
  });
});
