// ============================================================================
// friction.signal — Phase 4.7 coverage.
//
// Asserts:
//   - empty friction list → just the LLM raw (rounded/clamped)
//   - single friction: catalog severity wins when higher than LLM
//   - single friction: LLM wins when higher than catalog
//   - multi-friction boost: +5 per additional, capped at +15
//   - output clamped to [0, 100]
// ============================================================================

import { describe, it, expect, vi } from "vitest";

vi.mock("@ava/shared", () => ({
  // Catalog severities sized so each rule is exercised.
  getSeverity: (id: string) => {
    const m: Record<string, number> = {
      F001: 90, // catalog beats LLM
      F002: 40, // LLM beats catalog
      F003: 50,
      F004: 50,
      F005: 50,
      F006: 50,
    };
    return m[id] ?? 0;
  },
}));

import { adjustFriction } from "./friction.signal";

describe("adjustFriction — empty list", () => {
  it("returns the LLM raw (rounded + clamped) when no frictions detected", () => {
    expect(adjustFriction(42, [])).toBe(42);
    expect(adjustFriction(120, [])).toBe(100);
    expect(adjustFriction(-5, [])).toBe(0);
    expect(adjustFriction(42.6, [])).toBe(43);
  });
});

describe("adjustFriction — single friction", () => {
  it("uses catalog severity when higher than LLM raw", () => {
    // catalog F001 = 90, LLM = 40 → 90
    expect(adjustFriction(40, ["F001"])).toBe(90);
  });
  it("uses LLM raw when higher than catalog severity", () => {
    // catalog F002 = 40, LLM = 70 → 70
    expect(adjustFriction(70, ["F002"])).toBe(70);
  });
});

describe("adjustFriction — multi-friction boost", () => {
  it("+5 per additional friction beyond the first", () => {
    // 2 frictions → +5; baseline = max(LLM=20, severity=50) = 50 → 55
    expect(adjustFriction(20, ["F003", "F004"])).toBe(55);
  });
  it("boost caps at +15 (3 additional past the primary, total 4)", () => {
    // baseline 50, 4 frictions → +15 → 65; 5 frictions also +15 (capped)
    expect(adjustFriction(20, ["F003", "F004", "F005", "F006"])).toBe(65);
    expect(adjustFriction(20, ["F003", "F004", "F005", "F006", "F001"])).toBe(105 > 100 ? 100 : 105);
    // ^ With F001 (sev 90) in the mix, base becomes 90 + 15 = 105 → clamped to 100.
  });
});

describe("adjustFriction — clamping", () => {
  it("clamps the final score to <=100", () => {
    expect(adjustFriction(99, ["F001"])).toBeLessThanOrEqual(100);
  });
});
