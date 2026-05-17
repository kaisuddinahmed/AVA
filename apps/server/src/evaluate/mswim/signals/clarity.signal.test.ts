// ============================================================================
// clarity.signal — Phase 4.7 coverage.
//
// Asserts:
//   - rule-based corroboration: +10
//   - young session (<60s): -15
//   - low event count (≤2): -10
//   - clamp + round
// ============================================================================

import { describe, it, expect } from "vitest";
import { adjustClarity } from "./clarity.signal";

const BASE = {
  sessionAgeSec: 300,
  eventCount: 20,
  ruleBasedCorroboration: false,
};

describe("adjustClarity", () => {
  it("returns the raw score when no adjustments apply", () => {
    expect(adjustClarity(50, BASE)).toBe(50);
  });

  it("+10 with rule-based corroboration", () => {
    expect(adjustClarity(50, { ...BASE, ruleBasedCorroboration: true })).toBe(60);
  });

  it("-15 on young sessions (< 60s)", () => {
    expect(adjustClarity(50, { ...BASE, sessionAgeSec: 30 })).toBe(35);
  });

  it("60s exactly is NOT young", () => {
    expect(adjustClarity(50, { ...BASE, sessionAgeSec: 60 })).toBe(50);
  });

  it("-10 with low event count (<=2)", () => {
    expect(adjustClarity(50, { ...BASE, eventCount: 2 })).toBe(40);
    expect(adjustClarity(50, { ...BASE, eventCount: 0 })).toBe(40);
  });

  it("penalties stack", () => {
    expect(adjustClarity(50, { ...BASE, sessionAgeSec: 10, eventCount: 1 })).toBe(50 - 15 - 10);
  });

  it("clamps to [0, 100]", () => {
    expect(adjustClarity(-99, BASE)).toBe(0);
    expect(adjustClarity(200, BASE)).toBe(100);
  });

  it("rounds fractional inputs", () => {
    expect(adjustClarity(50.4, { ...BASE, ruleBasedCorroboration: true })).toBe(60);
  });
});
