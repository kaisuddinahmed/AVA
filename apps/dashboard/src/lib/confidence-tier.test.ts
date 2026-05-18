// ============================================================================
// confidence-tier — Codex review follow-up unit tests.
//
// Asserts the rules-based / learning / learned bucketing that the
// InterveneTab ConfidenceChip displays. Lock the boundaries so a future
// engine tuning doesn't silently regress merchant trust signals.
// ============================================================================

import { describe, it, expect } from "vitest";
import { classifyConfidence } from "./confidence-tier";

// ── Pre-outcome (approval queue) ───────────────────────────────────────────

describe("classifyConfidence — pre-outcome (no experiment yet)", () => {
  it("low confidence OR low sample → rules", () => {
    expect(classifyConfidence({ confidence: 0.4, sampleSizeBasis: 200 })).toBe("rules");
    expect(classifyConfidence({ confidence: 0.9, sampleSizeBasis: 40 })).toBe("rules");
    expect(classifyConfidence({ confidence: 0.1, sampleSizeBasis: 25 })).toBe("rules");
  });

  it("high confidence AND high sample → learned", () => {
    expect(classifyConfidence({ confidence: 0.85, sampleSizeBasis: 500 })).toBe("learned");
    expect(classifyConfidence({ confidence: 0.7, sampleSizeBasis: 100 })).toBe("learned");
  });

  it("mid-range (>=0.5 confidence + >=50 samples but below learned thresholds) → learning", () => {
    expect(classifyConfidence({ confidence: 0.6, sampleSizeBasis: 80 })).toBe("learning");
    expect(classifyConfidence({ confidence: 0.5, sampleSizeBasis: 50 })).toBe("learning");
    expect(classifyConfidence({ confidence: 0.65, sampleSizeBasis: 99 })).toBe("learning");
  });

  it("boundary: confidence=0.7 + samples=100 should already qualify as learned", () => {
    expect(classifyConfidence({ confidence: 0.7, sampleSizeBasis: 100 })).toBe("learned");
  });
});

// ── Post-outcome (experiment running or done) ──────────────────────────────

describe("classifyConfidence — post-outcome takes precedence", () => {
  const recArg = { confidence: 0.4, sampleSizeBasis: 25 }; // would be "rules" pre-outcome

  it("significant outcome + >=100 total sessions → learned (overrides rec input)", () => {
    expect(
      classifyConfidence(recArg, { significant: true, variantSessions: 60, controlSessions: 60 }),
    ).toBe("learned");
  });

  it("significant outcome but <100 total sessions → learning (not yet trustworthy)", () => {
    expect(
      classifyConfidence(recArg, { significant: true, variantSessions: 30, controlSessions: 30 }),
    ).toBe("learning");
  });

  it("not significant + low sample → rules (running, no real signal yet)", () => {
    expect(
      classifyConfidence(recArg, { significant: false, variantSessions: 10, controlSessions: 10 }),
    ).toBe("rules");
  });

  it("not significant + medium sample → learning (waiting for confidence)", () => {
    expect(
      classifyConfidence(recArg, { significant: false, variantSessions: 50, controlSessions: 50 }),
    ).toBe("learning");
  });

  it("outcome.significant=undefined treated as not-significant", () => {
    expect(
      classifyConfidence(recArg, { variantSessions: 100, controlSessions: 100 }),
    ).toBe("learning");
  });

  it("null outcome falls back to rec-based classification (does NOT crash)", () => {
    expect(classifyConfidence(recArg, null)).toBe("rules");
    expect(classifyConfidence(recArg, undefined)).toBe("rules");
  });
});
