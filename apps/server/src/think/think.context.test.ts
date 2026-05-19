// ============================================================================
// think.context — pure-function unit tests for buildContextFromInputs.
//
// loadThinkContext() hits live repos; it's covered by the intervene
// integration tests. buildContextFromInputs is the pure transform we can
// drive without touching the DB, so it gets the dense unit coverage.
// ============================================================================

import { describe, it, expect } from "vitest";
import { buildContextFromInputs } from "./think.context.js";

describe("buildContextFromInputs", () => {
  it("returns empty defaults when nothing is provided", () => {
    const ctx = buildContextFromInputs({});
    expect(ctx).toEqual({
      liveObjections: [],
      turnIndex: 0,
      coachingHints: null,
      llmInput: null,
    });
  });

  it("includes inferred objections above the confidence threshold", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [
        { type: "price", confidence: 0.9 },
        { type: "fit", confidence: 0.7 },
      ],
    });
    expect(ctx.liveObjections).toEqual(["price", "fit"]);
  });

  it("drops objections below the confidence threshold (0.55)", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [
        { type: "price", confidence: 0.9 },
        { type: "fit", confidence: 0.4 },
      ],
    });
    expect(ctx.liveObjections).toEqual(["price"]);
  });

  it("orders objections by confidence descending", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [
        { type: "fit", confidence: 0.6 },
        { type: "price", confidence: 0.95 },
        { type: "trust", confidence: 0.7 },
      ],
    });
    expect(ctx.liveObjections).toEqual(["price", "trust", "fit"]);
  });

  it("ignores unknown objection types", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [
        { type: "price", confidence: 0.9 },
        { type: "bogus", confidence: 0.99 },
      ],
    });
    expect(ctx.liveObjections).toEqual(["price"]);
  });

  it("merges in known objection-type strings from ConversationState", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [{ type: "price", confidence: 0.9 }],
      conversationObjections: ["trust", "garbage"],
    });
    expect(ctx.liveObjections).toEqual(["price", "trust"]);
  });

  it("de-dupes objections present in both sources", () => {
    const ctx = buildContextFromInputs({
      inferredObjections: [{ type: "price", confidence: 0.9 }],
      conversationObjections: ["price"],
    });
    expect(ctx.liveObjections).toEqual(["price"]);
  });

  it("passes turnCount through verbatim", () => {
    const ctx = buildContextFromInputs({ turnCount: 7 });
    expect(ctx.turnIndex).toBe(7);
  });
});
