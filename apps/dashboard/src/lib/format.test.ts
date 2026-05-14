// ============================================================================
// Dashboard format helpers — smoke test for the @ava/dashboard test harness.
// ============================================================================

import { describe, it, expect } from "vitest";
import { fmtNum, fmtPct, fmtTime } from "./format.js";

describe("dashboard/lib/format (smoke)", () => {
  it("formats whole numbers with thousands separators", () => {
    expect(fmtNum(1234567)).toBe("1,234,567");
  });

  it("formats a 0–1 ratio as a one-decimal percentage", () => {
    expect(fmtPct(0.4267)).toBe("42.7%");
  });

  it("falls back gracefully on an invalid timestamp", () => {
    expect(fmtTime("not-a-date")).toBe("--:--:--");
  });
});
