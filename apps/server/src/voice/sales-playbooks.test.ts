// ============================================================================
// sales-playbooks — Phase 2.3 unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  ALL_PLAYBOOKS,
  VOICE_SCRIPT_MAX_CHARS,
  getPlaybook,
  pickPlaybookForFrictions,
  selectStep,
} from "./sales-playbooks.js";

describe("sales-playbooks — voice_script budget (CLAUDE.md hard rule)", () => {
  it.each(ALL_PLAYBOOKS)("$frictionId every step's voice_script ≤80 chars", (pb) => {
    pb.steps.forEach((step, i) => {
      expect(
        step.voice_script.length,
        `${pb.frictionId} step ${i}: "${step.voice_script}"`,
      ).toBeLessThanOrEqual(VOICE_SCRIPT_MAX_CHARS);
    });
  });

  it("every step has both voice_script and sales_dialog populated", () => {
    for (const pb of ALL_PLAYBOOKS) {
      for (const step of pb.steps) {
        expect(step.voice_script.trim().length).toBeGreaterThan(0);
        expect(step.sales_dialog.trim().length).toBeGreaterThan(0);
        expect(step.objective.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("each step's sales_dialog is at least as long as its voice_script", () => {
    // The TTS chunk is the "short version" of the full bubble dialog; the
    // bubble shouldn't be shorter than what we already spoke.
    for (const pb of ALL_PLAYBOOKS) {
      for (const step of pb.steps) {
        expect(
          step.sales_dialog.length,
          `${pb.frictionId} step has sales_dialog shorter than voice_script`,
        ).toBeGreaterThanOrEqual(step.voice_script.length);
      }
    }
  });
});

describe("getPlaybook", () => {
  it("returns the playbook for a known F-code", () => {
    const pb = getPlaybook("F042");
    expect(pb).not.toBeNull();
    expect(pb!.frictionId).toBe("F042");
    expect(pb!.steps.length).toBeGreaterThan(0);
  });

  it("returns null for unknown codes", () => {
    expect(getPlaybook("F999")).toBeNull();
    expect(getPlaybook("")).toBeNull();
  });
});

describe("pickPlaybookForFrictions — first-match wins", () => {
  it("picks the first matching code in input order", () => {
    const pb = pickPlaybookForFrictions(["F999", "F042", "F100"]);
    expect(pb?.frictionId).toBe("F042");
  });

  it("returns null when no input code matches a registered playbook", () => {
    expect(pickPlaybookForFrictions(["F001", "F999"])).toBeNull();
  });

  it("handles empty input", () => {
    expect(pickPlaybookForFrictions([])).toBeNull();
  });
});

describe("selectStep — turn-count cycling", () => {
  it("turn 0 returns step 0", () => {
    const pb = getPlaybook("F042")!;
    expect(selectStep(pb, 0)).toBe(pb.steps[0]);
  });

  it("turn N modulo step count cycles through steps", () => {
    const pb = getPlaybook("F042")!;
    // F042 has 2 steps. Turn 2 wraps to step 0 again.
    expect(selectStep(pb, 1)).toBe(pb.steps[1]);
    expect(selectStep(pb, 2)).toBe(pb.steps[0]);
    expect(selectStep(pb, 3)).toBe(pb.steps[1]);
  });

  it("single-step playbook always returns its sole step", () => {
    const pb = getPlaybook("F036")!;
    expect(pb.steps.length).toBe(1);
    expect(selectStep(pb, 0)).toBe(pb.steps[0]);
    expect(selectStep(pb, 99)).toBe(pb.steps[0]);
  });
});
