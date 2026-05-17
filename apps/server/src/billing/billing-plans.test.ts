// ============================================================================
// billing-plans — Phase 4.5 unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import { getPlan, listPlans, isFreePlan, comparePlans } from "./billing-plans.js";

describe("getPlan", () => {
  it("returns the requested plan by id", () => {
    expect(getPlan("free")?.id).toBe("free");
    expect(getPlan("starter")?.id).toBe("starter");
    expect(getPlan("pro")?.id).toBe("pro");
  });

  it("returns null for unknown ids", () => {
    expect(getPlan("enterprise")).toBeNull();
  });
});

describe("listPlans", () => {
  it("returns all three tiers ordered by level", () => {
    const ids = listPlans().map((p) => p.id);
    expect(ids).toEqual(["free", "starter", "pro"]);
  });
});

describe("isFreePlan", () => {
  it("free plan has null recurring → isFreePlan=true", () => {
    expect(isFreePlan(getPlan("free")!)).toBe(true);
  });
  it("paid plans return false", () => {
    expect(isFreePlan(getPlan("starter")!)).toBe(false);
    expect(isFreePlan(getPlan("pro")!)).toBe(false);
  });
});

describe("plan structure", () => {
  it("paid plans declare USD price + 30-day interval", () => {
    const starter = getPlan("starter")!;
    expect(starter.recurring?.amount).toBe(29);
    expect(starter.recurring?.interval).toBe("EVERY_30_DAYS");
    const pro = getPlan("pro")!;
    expect(pro.recurring?.amount).toBe(99);
  });

  it("paid plans include a 14-day trial", () => {
    expect(getPlan("starter")!.trialDays).toBe(14);
    expect(getPlan("pro")!.trialDays).toBe(14);
  });

  it("paid plans declare usage line items with capped amounts", () => {
    expect(getPlan("starter")!.usage?.cappedAmountUsd).toBe(100);
    expect(getPlan("pro")!.usage?.cappedAmountUsd).toBe(500);
  });

  it("free plan has no recurring AND no usage line item", () => {
    const free = getPlan("free")!;
    expect(free.recurring).toBeNull();
    expect(free.usage).toBeUndefined();
  });
});

describe("comparePlans", () => {
  it("first subscription (no current) → upgrade", () => {
    expect(comparePlans(null, "starter")).toBe("upgrade");
    expect(comparePlans(undefined, "pro")).toBe("upgrade");
  });

  it("higher tier → upgrade", () => {
    expect(comparePlans("free", "starter")).toBe("upgrade");
    expect(comparePlans("starter", "pro")).toBe("upgrade");
  });

  it("lower tier → downgrade", () => {
    expect(comparePlans("pro", "starter")).toBe("downgrade");
    expect(comparePlans("starter", "free")).toBe("downgrade");
  });

  it("same tier → same", () => {
    expect(comparePlans("pro", "pro")).toBe("same");
  });

  it("throws on unknown target", () => {
    expect(() => comparePlans("starter", "enterprise")).toThrow(/Unknown plan/);
  });
});
