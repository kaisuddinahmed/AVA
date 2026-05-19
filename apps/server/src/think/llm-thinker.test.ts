// ============================================================================
// llm-thinker tests — mocks Groq, exercises validation + budget + cache.
//
// Per CLAUDE.md hard rule: never call real Groq in tests.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ----- Mocks ----------------------------------------------------------------
const createMock = vi.fn();
vi.mock("groq-sdk", () => ({
  default: class {
    constructor() {
      // no-op stub
    }
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

vi.mock("../config.js", () => ({
  config: {
    groq: { apiKey: "test-key", model: "test-model" },
  },
}));

const { llmThink, isLlmThinkingEnabled, __resetLlmThinkerState } = await import(
  "./llm-thinker.js"
);

function mockReply(content: string) {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content } }],
  });
}

function validMoveJson(): string {
  return JSON.stringify({
    intent: "objection_handle",
    objection_type: "price",
    voice_script: "Here's why customers still pick it: better warranty.",
    sales_dialog:
      "It is on the higher side, but the warranty + bundled returns + free shipping usually nets out cheaper over time. Tell me what would change your mind.",
    playbook_objective: "Justify price with bundled value.",
    tone: "confident",
    expected_visitor_response: "ask_followup",
    next_state_mood: "engaged",
  });
}

function baseInput() {
  return {
    sessionId: "s_test",
    frictionId: "F117",
    frictionIds: ["F117"],
    tier: "ACTIVE",
    visitorContext: {
      mood: "hesitant",
      decisionPressure: 60,
      priceSensitivity: 70,
      personaHint: "researcher" as const,
      objections: [{ type: "price", confidence: 0.8 }],
    },
  };
}

beforeEach(() => {
  __resetLlmThinkerState();
  createMock.mockReset();
  process.env.THINK_LLM_ENABLED = "true";
});

describe("isLlmThinkingEnabled", () => {
  it("respects THINK_LLM_ENABLED env var", () => {
    process.env.THINK_LLM_ENABLED = "true";
    expect(isLlmThinkingEnabled()).toBe(true);
    process.env.THINK_LLM_ENABLED = "false";
    expect(isLlmThinkingEnabled()).toBe(false);
  });
});

describe("llmThink — happy path", () => {
  it("parses a valid LLM reply into a SalespersonMove", async () => {
    mockReply(validMoveJson());
    const move = await llmThink(baseInput());
    expect(move).not.toBeNull();
    expect(move!.intent).toBe("objection_handle");
    expect(move!.objection_type).toBe("price");
    expect(move!.tactic_id).toBe("LLM_GEN");
    expect(move!.tone).toBe("confident");
    expect(move!.attribution_tag).toBe("F117:LLM_GEN");
    expect((move!.voice_script ?? "").length).toBeLessThanOrEqual(80);
  });
});

describe("llmThink — validation", () => {
  it("rejects voice_script over 80 chars", async () => {
    mockReply(
      JSON.stringify({
        intent: "highlight",
        voice_script: "x".repeat(81),
        sales_dialog: "y".repeat(100),
      }),
    );
    expect(await llmThink(baseInput())).toBeNull();
  });

  it("rejects sales_dialog over 500 chars", async () => {
    mockReply(
      JSON.stringify({
        intent: "highlight",
        voice_script: "short",
        sales_dialog: "y".repeat(501),
      }),
    );
    expect(await llmThink(baseInput())).toBeNull();
  });

  it("rejects unknown intent", async () => {
    mockReply(
      JSON.stringify({
        intent: "yelling",
        voice_script: "short",
        sales_dialog: "longer-than-short.",
      }),
    );
    expect(await llmThink(baseInput())).toBeNull();
  });

  it("rejects malformed JSON", async () => {
    mockReply("not-json{{{");
    expect(await llmThink(baseInput())).toBeNull();
  });

  it("only stamps objection_type when intent === objection_handle", async () => {
    mockReply(
      JSON.stringify({
        intent: "highlight",
        objection_type: "price", // should be ignored
        voice_script: "short",
        sales_dialog: "Longer than short.",
      }),
    );
    const move = await llmThink(baseInput());
    expect(move?.objection_type).toBeNull();
  });
});

describe("llmThink — budget", () => {
  it("returns null after the per-session budget is exhausted", async () => {
    mockReply(validMoveJson()); // call 1
    mockReply(validMoveJson()); // call 2
    mockReply(validMoveJson()); // call 3 (would be over budget)

    // Call 1 — same input, hits LLM, then caches.
    const m1 = await llmThink({ ...baseInput(), frictionId: "F117" });
    expect(m1).not.toBeNull();

    // Call 2 — different friction → new cache key → real call, increments budget.
    const m2 = await llmThink({ ...baseInput(), frictionId: "F042", frictionIds: ["F042"] });
    expect(m2).not.toBeNull();

    // Call 3 — different friction again → budget gate blocks the LLM call.
    const m3 = await llmThink({ ...baseInput(), frictionId: "F060", frictionIds: ["F060"] });
    expect(m3).toBeNull();
    // We mocked 3 replies but only 2 should have been consumed (call 3 short-circuits).
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

describe("llmThink — cache", () => {
  it("reuses the cached move for the same input shape", async () => {
    mockReply(validMoveJson());
    const m1 = await llmThink(baseInput());
    const m2 = await llmThink(baseInput()); // identical input → cache hit
    expect(m1).toEqual(m2);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe("llmThink — guards", () => {
  it("returns null when disabled", async () => {
    process.env.THINK_LLM_ENABLED = "false";
    expect(await llmThink(baseInput())).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});
