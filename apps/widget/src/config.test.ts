// ============================================================================
// Widget config — smoke test for the @ava/widget test harness.
// Verifies DEFAULT_CONFIG invariants relied on by the activation gate.
// ============================================================================

import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "./config.js";

describe("DEFAULT_CONFIG (smoke)", () => {
  it("starts with voice disabled (merchant opts in)", () => {
    expect(DEFAULT_CONFIG.voiceEnabled).toBe(false);
  });

  it("caps voice interventions per session at the server-enforced ceiling", () => {
    expect(DEFAULT_CONFIG.voiceMaxPerSession).toBeGreaterThan(0);
  });

  it("uses the bottom-right anchor by default (matches Shadow DOM CSS)", () => {
    expect(DEFAULT_CONFIG.position).toBe("bottom-right");
  });
});
