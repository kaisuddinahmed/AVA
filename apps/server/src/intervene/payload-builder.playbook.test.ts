// ============================================================================
// payload-builder — Phase 2.6 playbook-layering tests.
//
// Proves that when the proactive intervene path fires for a known F-code:
//   - voice_script is replaced by the playbook's ≤80-char chunk
//   - sales_dialog + playbook_objective fields appear on the payload
//   - the budget guard still applies (voiceDisabled → no script/sales_dialog
//     reaches the widget over the wire even if a playbook exists)
//   - unknown F-codes fall back to the message template (no sales_dialog)
//   - passive tier stays silent regardless of playbook presence
// ============================================================================

import { describe, it, expect } from "vitest";
import { buildPayload } from "./payload-builder.js";
import type { EvaluationResult } from "../evaluate/evaluate.service.js";

function fakeEval(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    sessionId: "s_x",
    composite: 70,
    intent: 60, friction: 70, clarity: 60, receptivity: 60, value: 60,
    tier: "ACTIVE",
    decision: "fire",
    reasoning: "test",
    frictionIds: ["F042"],
    behaviorIds: [],
    weights: { intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.20, value: 0.15 },
    // The escalate branch of payload-builder reads evaluation.signals.value
    // to pick a discount tier — provide it so the fixture is complete.
    signals: { intent: 60, friction: 70, clarity: 60, receptivity: 60, value: 60 },
    ...overrides,
  } as unknown as EvaluationResult;
}

describe("Phase 2.6 — playbook layering on proactive fires", () => {
  it("F042 active → payload carries playbook voice_script + sales_dialog", async () => {
    const p = await buildPayload("active", "PRODUCT_SUGGEST", "F042", fakeEval());
    expect(p.voice_enabled).toBe(true);
    expect(p.voice_script).toMatch(/peek|similar/i);
    expect((p.voice_script as string).length).toBeLessThanOrEqual(80);
    expect(typeof p.sales_dialog).toBe("string");
    expect((p.sales_dialog as string).length).toBeGreaterThan(
      (p.voice_script as string).length,
    );
    expect(typeof p.playbook_objective).toBe("string");
  });

  it("F100 nudge → shipping simplifier playbook applies", async () => {
    const p = await buildPayload("nudge", "SHIPPING_PROMPT", "F100", fakeEval({ tier: "NUDGE" }));
    expect(p.voice_script).toMatch(/standard|ships free/i);
    expect(p.sales_dialog).toMatch(/standard/i);
  });

  it("unknown F-code → no playbook fields, falls back to template", async () => {
    const p = await buildPayload("active", "SOMETHING", "F999", fakeEval());
    expect(p.sales_dialog).toBeUndefined();
    expect(p.playbook_objective).toBeUndefined();
  });

  it("voiceDisabled=true → no voice_script even when playbook matches", async () => {
    const p = await buildPayload("active", "X", "F042", fakeEval(), undefined, true);
    expect(p.voice_enabled).toBe(false);
    expect(p.voice_script).toBeUndefined();
    // sales_dialog still flows through — the bubble text is independent of
    // the audio budget. (Mute kills audio, not the visual nudge.)
    expect(p.sales_dialog).toBeTruthy();
  });

  it("passive tier → fully silent (no audio AND no sales_dialog, Codex P2)", async () => {
    const p = await buildPayload("passive", "X", "F042", fakeEval({ tier: "PASSIVE" }));
    expect(p.voice_enabled).toBe(false);
    expect(p.voice_script).toBeUndefined();
    // Passive is "silent observation" — no proactive salesperson bubble.
    expect(p.sales_dialog).toBeUndefined();
    expect(p.playbook_objective).toBeUndefined();
  });

  it("escalate tier on F042 → playbook layered AND voice enabled", async () => {
    const p = await buildPayload("escalate", "RECOVER", "F042", fakeEval({ tier: "ESCALATE" }));
    expect(p.voice_enabled).toBe(true);
    expect(p.voice_script).toBeTruthy();
    expect(p.sales_dialog).toBeTruthy();
  });
});
