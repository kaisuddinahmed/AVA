// ============================================================================
// receptivity.signal — Phase 4.7 coverage.
//
// computeReceptivity starts at base (80) and applies decrements + increments.
// Final blend with LLM hint is 90/10.
// Asserts each decrement, each increment, blending, and clamping.
// ============================================================================

import { describe, it, expect } from "vitest";
import { computeReceptivity } from "./receptivity.signal";

const BASE = {
  totalInterventionsFired: 0,
  totalDismissals: 0,
  secondsSinceLastIntervention: null as number | null,
  isMobile: false,
  widgetOpenedVoluntarily: false,
  idleSeconds: 0,
  hasRecentCheckoutAbandon: false,
};

describe("computeReceptivity — neutral", () => {
  it("returns 80 base when no signals fire (LLM hint matches base)", () => {
    expect(computeReceptivity(80, BASE)).toBe(80);
  });

  it("blends LLM hint at 10% weight", () => {
    // (80 * 0.9) + (50 * 0.1) = 72 + 5 = 77
    expect(computeReceptivity(50, BASE)).toBe(77);
  });
});

describe("computeReceptivity — decrements", () => {
  it("-15 per non-passive intervention fired", () => {
    // (80 - 30) blended = 50 * 0.9 + 50 * 0.1 = 50
    expect(computeReceptivity(50, { ...BASE, totalInterventionsFired: 2 })).toBe(50);
  });

  it("-25 per dismissal", () => {
    // (80 - 25) * 0.9 + 55 * 0.1 = 49.5 + 5.5 = 55
    expect(computeReceptivity(55, { ...BASE, totalDismissals: 1 })).toBe(55);
  });

  it("-10 when last intervention was < 120s ago", () => {
    // (80 - 10) blended with 70 LLM hint = 70 * 0.9 + 70 * 0.1 = 70
    expect(computeReceptivity(70, { ...BASE, secondsSinceLastIntervention: 30 })).toBe(70);
  });

  it("no penalty at exactly 120s", () => {
    expect(computeReceptivity(80, { ...BASE, secondsSinceLastIntervention: 120 })).toBe(80);
  });

  it("-5 on mobile", () => {
    expect(computeReceptivity(75, { ...BASE, isMobile: true })).toBe(75);
  });

  it("-30 on checkout abandon (the big one)", () => {
    expect(computeReceptivity(50, { ...BASE, hasRecentCheckoutAbandon: true })).toBe(50);
  });
});

describe("computeReceptivity — increments", () => {
  it("+10 for voluntary widget open", () => {
    // (80 + 10) * 0.9 + 90 * 0.1 = 81 + 9 = 90
    expect(computeReceptivity(90, { ...BASE, widgetOpenedVoluntarily: true })).toBe(90);
  });

  it("+10 when idle > 60s", () => {
    expect(computeReceptivity(90, { ...BASE, idleSeconds: 90 })).toBe(90);
  });

  it("no increment at exactly 60s idle (strict >)", () => {
    expect(computeReceptivity(80, { ...BASE, idleSeconds: 60 })).toBe(80);
  });
});

describe("computeReceptivity — clamping", () => {
  it("clamps to >=0 with many decrements", () => {
    expect(computeReceptivity(0, {
      ...BASE,
      totalInterventionsFired: 10,
      totalDismissals: 10,
      hasRecentCheckoutAbandon: true,
    })).toBe(0);
  });
  it("clamps to <=100 with multiple increments + max LLM hint", () => {
    expect(computeReceptivity(100, {
      ...BASE,
      widgetOpenedVoluntarily: true,
      idleSeconds: 999,
    })).toBe(100);
  });
});
