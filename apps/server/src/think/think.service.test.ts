// ============================================================================
// think.service — step 2 passthrough parity tests.
//
// Pins the behavior contract: for every playbook in sales-playbooks.ts, the
// SalespersonMove emitted by decideMove must contain the same voice_script /
// sales_dialog / objective that the previous payload-builder path produced
// when it called `selectStep(playbook, 0)` directly. If a future change
// breaks parity, these tests fail and the change has to come with an
// explicit migration of every payload-builder consumer.
// ============================================================================

import { describe, it, expect } from "vitest";
import { decideMove } from "./think.service.js";
import {
  ALL_PLAYBOOKS,
  pickPlaybookForFrictions,
  selectStep,
  getPlaybook,
} from "../voice/sales-playbooks.js";

function baseInput(overrides: Partial<Parameters<typeof decideMove>[0]> = {}) {
  return {
    interventionType: "nudge",
    actionCode: "nudge_suggestion",
    frictionId: "F042",
    frictionIds: ["F042"] as readonly string[],
    tier: "NUDGE",
    turnIndex: 0,
    ...overrides,
  };
}

describe("decideMove — passthrough parity", () => {
  it("returns null voice content when no playbook matches", () => {
    const move = decideMove(
      baseInput({ frictionId: "F999", frictionIds: ["F999"] }),
    );
    expect(move.voice_script).toBeNull();
    expect(move.sales_dialog).toBeNull();
    expect(move.playbook_objective).toBeNull();
    expect(move.tactic_id).toBeNull();
  });

  it.each(ALL_PLAYBOOKS.map((pb) => [pb.frictionId]))(
    "matches selectStep(playbook, 0) for playbook %s",
    (frictionId) => {
      const playbook = getPlaybook(frictionId);
      if (!playbook) throw new Error(`missing fixture playbook ${frictionId}`);
      const expected = selectStep(playbook, 0);

      const move = decideMove(
        baseInput({ frictionId, frictionIds: [frictionId] }),
      );
      expect(move.voice_script).toBe(expected.voice_script);
      expect(move.sales_dialog).toBe(expected.sales_dialog);
      expect(move.playbook_objective).toBe(expected.objective);
      expect(move.tactic_id).toBe(`${frictionId}_step0`);
    },
  );

  it("first-matching wins when multiple frictions have playbooks", () => {
    // F999 has no playbook; F042 does. With both present, F042 wins.
    const move = decideMove(
      baseInput({ frictionId: "F999", frictionIds: ["F999", "F042"] }),
    );
    const expected = selectStep(pickPlaybookForFrictions(["F999", "F042"])!, 0);
    expect(move.voice_script).toBe(expected.voice_script);
  });

  it("turnIndex cycles step selection (parity with selectStep modulo)", () => {
    const playbook = getPlaybook("F042"); // has 2 steps
    if (!playbook || playbook.steps.length < 2) throw new Error("F042 must have ≥2 steps for this test");

    const moveTurn0 = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 0 }),
    );
    const moveTurn1 = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 1 }),
    );
    expect(moveTurn0.voice_script).toBe(playbook.steps[0].voice_script);
    expect(moveTurn1.voice_script).toBe(playbook.steps[1].voice_script);
    expect(moveTurn0.tactic_id).toBe("F042_step0");
    expect(moveTurn1.tactic_id).toBe("F042_step1");
  });
});

describe("decideMove — shape invariants", () => {
  it("stamps an attribution_tag including friction + action + passthrough marker", () => {
    const move = decideMove(
      baseInput({ frictionId: "F042", actionCode: "active_comparison" }),
    );
    expect(move.attribution_tag).toBe("F042:active_comparison:passthrough");
  });

  it("intent flows from the playbook step (step 3 wiring)", () => {
    const move = decideMove(baseInput({ frictionId: "F042", frictionIds: ["F042"] }));
    // F042 step 0 is intent=highlight per the step-3 playbook expansion.
    expect(move.intent).toBe("highlight");
  });

  it("objection_type flows from the playbook step when present", () => {
    // F042 step 1 is intent=objection_handle, objection_type=price.
    const move = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 1 }),
    );
    expect(move.intent).toBe("objection_handle");
    expect(move.objection_type).toBe("price");
  });

  it("intent and objection_type remain null when no playbook matches", () => {
    const move = decideMove(
      baseInput({ frictionId: "F999", frictionIds: ["F999"] }),
    );
    expect(move.intent).toBeNull();
    expect(move.objection_type).toBeNull();
  });
});

describe("decideMove — content-based step selection (step 4)", () => {
  it("matches a live 'price' objection to the F042 price step (step 1)", () => {
    // F042 step 0 = highlight; step 1 = objection_handle/price.
    const move = decideMove(
      baseInput({
        frictionId: "F042",
        frictionIds: ["F042"],
        turnIndex: 0,
        liveObjections: ["price"],
      }),
    );
    expect(move.intent).toBe("objection_handle");
    expect(move.objection_type).toBe("price");
    expect(move.tactic_id).toBe("F042_step1");
  });

  it("matches a live 'trust' objection on F094 to its trust step (step 1)", () => {
    const move = decideMove(
      baseInput({
        frictionId: "F094",
        frictionIds: ["F094"],
        turnIndex: 0,
        liveObjections: ["trust"],
      }),
    );
    expect(move.objection_type).toBe("trust");
    expect(move.tactic_id).toBe("F094_step1");
  });

  it("falls back to turn-count cycling when no objection matches a step", () => {
    // F020 has no objection_handle steps. With turnIndex=1 the legacy
    // cycle picks step 1; the 'price' objection is ignored gracefully.
    const move = decideMove(
      baseInput({
        frictionId: "F020",
        frictionIds: ["F020"],
        turnIndex: 1,
        liveObjections: ["price"],
      }),
    );
    expect(move.tactic_id).toBe("F020_step1");
  });

  it("first-confidence-ordered objection wins when multiple are live", () => {
    // F042 has steps for `price` and `choice`. With both live, the FIRST
    // entry wins (caller is responsible for confidence ordering).
    const move = decideMove(
      baseInput({
        frictionId: "F042",
        frictionIds: ["F042"],
        turnIndex: 0,
        liveObjections: ["choice", "price"],
      }),
    );
    expect(move.objection_type).toBe("choice");
    expect(move.tactic_id).toBe("F042_step2");
  });

  it("no objections + turnIndex=0 still picks step 0 (parity preserved)", () => {
    const move = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 0 }),
    );
    expect(move.tactic_id).toBe("F042_step0");
    expect(move.intent).toBe("highlight");
  });

  it("expected_visitor_response is populated from playbook intent (Codex P2.4)", () => {
    // F042 step 0 is intent=highlight → expect click_cta.
    const move = decideMove(baseInput({ frictionId: "F042", frictionIds: ["F042"] }));
    expect(move.expected_visitor_response).toBe("click_cta");
  });

  it("next_state_hypothesis is populated with softer tier + predicted mood", () => {
    // F042 ACTIVE highlight → expected next tier NUDGE, mood engaged.
    const move = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], tier: "ACTIVE" }),
    );
    expect(move.next_state_hypothesis).toEqual({
      tier: "NUDGE",
      mood: "engaged",
    });
  });

  it("close-intent steps predict confident mood", () => {
    // F058 step 0 is intent=close.
    const move = decideMove(
      baseInput({ frictionId: "F058", frictionIds: ["F058"], tier: "ACTIVE" }),
    );
    expect(move.next_state_hypothesis?.mood).toBe("confident");
  });

  it("predictions stay null when no playbook matches", () => {
    const move = decideMove(
      baseInput({ frictionId: "F999", frictionIds: ["F999"] }),
    );
    expect(move.expected_visitor_response).toBeNull();
    expect(move.next_state_hypothesis).toBeNull();
  });
});

describe("decideMove — rule confidence (Codex P2.5)", () => {
  it("no playbook → confidence 0", () => {
    const move = decideMove(
      baseInput({ frictionId: "F999", frictionIds: ["F999"] }),
    );
    expect(move.confidence).toBe(0);
  });

  it("playbook + opener (turn 0, no objection) → 0.6", () => {
    const move = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 0 }),
    );
    expect(move.confidence).toBeCloseTo(0.6, 5);
  });

  it("playbook + turn cycling (turn>0, no objection) → 0.5", () => {
    const move = decideMove(
      baseInput({ frictionId: "F042", frictionIds: ["F042"], turnIndex: 1 }),
    );
    expect(move.confidence).toBeCloseTo(0.5, 5);
  });

  it("playbook + live objection match → 0.85", () => {
    const move = decideMove(
      baseInput({
        frictionId: "F042",
        frictionIds: ["F042"],
        turnIndex: 0,
        liveObjections: ["price"],
      }),
    );
    expect(move.confidence).toBeCloseTo(0.85, 5);
  });

  it.each([
    ["ESCALATE", "urgent"],
    ["ACTIVE", "confident"],
    ["NUDGE", "warm"],
    ["PASSIVE", "warm"],
    ["MONITOR", "warm"],
    ["UNKNOWN_TIER", "warm"],
  ])("default tone for tier %s is %s", (tier, tone) => {
    const move = decideMove(baseInput({ tier }));
    expect(move.tone).toBe(tone);
  });
});
