// ============================================================================
// value.signal — Phase 4.7 coverage.
//
// Tiered cart-value brackets + LTV boosts + paid-acq boost + LLM blend (80/20).
// VALUE_CART_BRACKETS from mswim-defaults.ts:
//   ≤20     →  15
//   ≤50     →  30
//   ≤100    →  50
//   ≤200    →  70
//   ≤500    →  85
//   Infinity → 95
// Boosts: logged-in +10, repeat-customer +15, paid acquisition +5
// ============================================================================

import { describe, it, expect } from "vitest";
import { computeValue } from "./value.signal";

const BASE = {
  cartValue: 0,
  isLoggedIn: false,
  isRepeatVisitor: false,
  referrerType: "direct",
};

describe("computeValue — cart brackets", () => {
  it("$0 → bracket 15", () => {
    // 15 * 0.8 + 15 * 0.2 = 15
    expect(computeValue(15, BASE)).toBe(15);
  });
  it("$50 (boundary) → bracket 30", () => {
    expect(computeValue(30, { ...BASE, cartValue: 50 })).toBe(30);
  });
  it("$75 → bracket 50", () => {
    expect(computeValue(50, { ...BASE, cartValue: 75 })).toBe(50);
  });
  it("$150 → bracket 70", () => {
    expect(computeValue(70, { ...BASE, cartValue: 150 })).toBe(70);
  });
  it("$1000 → bracket 95 (Infinity)", () => {
    expect(computeValue(95, { ...BASE, cartValue: 1000 })).toBe(95);
  });
});

describe("computeValue — boosts", () => {
  it("logged-in adds +10 (then blended 80/20)", () => {
    // base 15 + 10 = 25; 25 * 0.8 + 25 * 0.2 = 25
    expect(computeValue(25, { ...BASE, isLoggedIn: true })).toBe(25);
  });
  it("repeat-customer adds +15", () => {
    expect(computeValue(30, { ...BASE, isRepeatVisitor: true })).toBe(30);
  });
  it("paid acquisition adds +5", () => {
    expect(computeValue(20, { ...BASE, referrerType: "paid" })).toBe(20);
  });
  it("organic/direct referrer gets no boost", () => {
    expect(computeValue(15, { ...BASE, referrerType: "organic" })).toBe(15);
  });
});

describe("computeValue — LLM blend", () => {
  it("LLM hint contributes 20% weight", () => {
    // base bracket 15, LLM hint 95 → 15*0.8 + 95*0.2 = 12 + 19 = 31
    expect(computeValue(95, BASE)).toBe(31);
  });
});

describe("computeValue — clamping", () => {
  it("clamps to <=100 even with max boosts + max LLM hint", () => {
    expect(computeValue(100, {
      cartValue: 9999, isLoggedIn: true, isRepeatVisitor: true, referrerType: "paid",
    })).toBe(100);
  });
  it("never goes below 0 (lower bound)", () => {
    expect(computeValue(0, BASE)).toBeGreaterThanOrEqual(0);
  });
});
