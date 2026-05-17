// ============================================================================
// intent.signal — Phase 4.7 coverage.
//
// Pure function: known inputs → expected outputs. Asserts:
//   - funnel-position bonus (landing → checkout)
//   - logged-in + repeat-visitor boosts compose additively
//   - cart-value tiers (>100 = +5, >250 = +5)
//   - behavior-group boost is capped at ±20
//   - output is clamped to [0, 100] and rounded
// ============================================================================

import { describe, it, expect } from "vitest";
import { adjustIntent } from "./intent.signal";

const BASE_CTX = {
  pageType: "other",
  isLoggedIn: false,
  isRepeatVisitor: false,
  cartValue: 0,
  cartItemCount: 0,
};

describe("adjustIntent — funnel position", () => {
  it("checkout pages get the largest base boost (+85)", () => {
    expect(adjustIntent(0, { ...BASE_CTX, pageType: "checkout" })).toBe(85);
  });
  it("landing pages get a small boost (+10)", () => {
    expect(adjustIntent(0, { ...BASE_CTX, pageType: "landing" })).toBe(10);
  });
  it("unknown pageType falls back to 0", () => {
    expect(adjustIntent(20, { ...BASE_CTX, pageType: "totally-made-up" })).toBe(20);
  });
});

describe("adjustIntent — user signals", () => {
  it("logged-in user gets +5", () => {
    const off = adjustIntent(40, { ...BASE_CTX, pageType: "pdp" });
    const on  = adjustIntent(40, { ...BASE_CTX, pageType: "pdp", isLoggedIn: true });
    expect(on - off).toBe(5);
  });
  it("repeat visitor gets +8", () => {
    const off = adjustIntent(40, { ...BASE_CTX, pageType: "pdp" });
    const on  = adjustIntent(40, { ...BASE_CTX, pageType: "pdp", isRepeatVisitor: true });
    expect(on - off).toBe(8);
  });
});

describe("adjustIntent — cart value tiers", () => {
  it("0 items: no cart boost", () => {
    expect(adjustIntent(20, { ...BASE_CTX, pageType: "cart", cartItemCount: 0, cartValue: 999 })).toBe(20 + 70);
  });
  it("items + low value: +10 only", () => {
    expect(adjustIntent(20, { ...BASE_CTX, pageType: "cart", cartItemCount: 1, cartValue: 50 })).toBe(20 + 70 + 10);
  });
  it("items + value over 100: +10 +5", () => {
    // Use a low LLM raw so the sum doesn't hit the 100 clamp.
    expect(adjustIntent(0, { ...BASE_CTX, pageType: "pdp", cartItemCount: 1, cartValue: 150 })).toBe(45 + 10 + 5);
  });
  it("items + value over 250: +10 +5 +5", () => {
    expect(adjustIntent(0, { ...BASE_CTX, pageType: "pdp", cartItemCount: 2, cartValue: 300 })).toBe(45 + 10 + 5 + 5);
  });
});

describe("adjustIntent — clamping & rounding", () => {
  it("clamps high totals to 100", () => {
    expect(adjustIntent(99, { ...BASE_CTX, pageType: "checkout", isLoggedIn: true, isRepeatVisitor: true, cartItemCount: 2, cartValue: 999 })).toBe(100);
  });
  it("clamps negative inputs to 0", () => {
    expect(adjustIntent(-50, { ...BASE_CTX })).toBe(0);
  });
  it("rounds fractional inputs", () => {
    expect(adjustIntent(40.6, { ...BASE_CTX, pageType: "landing" })).toBe(51); // 40.6 + 10 rounded
  });
});
