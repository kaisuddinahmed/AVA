// ============================================================================
// mswim-directives — Phase 2.2 unit tests.
//
// Pure function, no I/O. Verifies the tier → directive mapping is correct,
// that null/unknown values default to PASSIVE, and that the directive
// includes the tier name so the LLM can self-reference (helpful for debug).
// ============================================================================

import { describe, it, expect } from "vitest";
import { tierDirective, asMswimTier, KNOWN_TIERS } from "./mswim-directives.js";

describe("tierDirective — assertiveness scales with tier", () => {
  it("MONITOR is the quietest tier (mentions 'silent' or 'do not push')", () => {
    const d = tierDirective("MONITOR");
    expect(d).toContain("MONITOR");
    expect(d.toLowerCase()).toMatch(/silent|do not push|one short sentence/);
  });

  it("PASSIVE stays reserved — no proactive suggestions", () => {
    const d = tierDirective("PASSIVE");
    expect(d).toContain("PASSIVE");
    expect(d.toLowerCase()).toMatch(/gentle|signals interest|only when/);
  });

  it("NUDGE is warm + one specific next step", () => {
    const d = tierDirective("NUDGE");
    expect(d).toContain("NUDGE");
    expect(d.toLowerCase()).toMatch(/one specific next step|one suggestion/);
  });

  it("ACTIVE is confident + action-oriented", () => {
    const d = tierDirective("ACTIVE");
    expect(d).toContain("ACTIVE");
    expect(d.toLowerCase()).toMatch(/confident|recommend|action-oriented|direct/);
  });

  it("ESCALATE is urgent recovery — addresses objection + single next step", () => {
    const d = tierDirective("ESCALATE");
    expect(d).toContain("ESCALATE");
    expect(d.toLowerCase()).toMatch(/urgent|objection|recovery|at high risk/);
  });
});

describe("tierDirective — defaults", () => {
  it("null/undefined → PASSIVE directive", () => {
    expect(tierDirective(null)).toBe(tierDirective("PASSIVE"));
    expect(tierDirective(undefined)).toBe(tierDirective("PASSIVE"));
  });

  it("unknown string → PASSIVE directive (safe fallback)", () => {
    expect(tierDirective("AGGRESSIVE")).toBe(tierDirective("PASSIVE"));
    expect(tierDirective("")).toBe(tierDirective("PASSIVE"));
  });

  it("each tier directive is distinct (no copy-paste collisions)", () => {
    const seen = new Set<string>();
    for (const t of KNOWN_TIERS) seen.add(tierDirective(t));
    expect(seen.size).toBe(KNOWN_TIERS.length);
  });
});

describe("asMswimTier — narrow string to tier", () => {
  it("returns the tier when valid", () => {
    expect(asMswimTier("ACTIVE")).toBe("ACTIVE");
    expect(asMswimTier("ESCALATE")).toBe("ESCALATE");
  });

  it("returns null for unknown strings", () => {
    expect(asMswimTier("AGGRESSIVE")).toBeNull();
    expect(asMswimTier("active")).toBeNull(); // case-sensitive
    expect(asMswimTier(null)).toBeNull();
    expect(asMswimTier(undefined)).toBeNull();
  });
});
