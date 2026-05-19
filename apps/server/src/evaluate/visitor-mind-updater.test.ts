// ============================================================================
// visitor-mind-updater — unit tests. Mocks VisitorMindRepo so we verify the
// derivation rules (mood / pressure / sensitivity / objections) without
// hitting the DB.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const recordMoodTransition = vi.fn(
  async (_sessionId: string, _siteUrl: string, _mood: string, _evidence: string) => ({}),
);
const updateScalar = vi.fn(
  async (_sessionId: string, _siteUrl: string, _patch: Record<string, unknown>) => ({}),
);
const addInferredObjection = vi.fn(
  async (
    _sessionId: string,
    _siteUrl: string,
    _objection: { type: string; confidence: number; evidence?: string[] },
  ) => ({}),
);

vi.mock("@ava/db", () => ({
  VisitorMindRepo: {
    recordMoodTransition,
    updateScalar,
    addInferredObjection,
  },
}));

const { updateVisitorMindFromEvaluation } = await import(
  "./visitor-mind-updater.js"
);

function fakeResult(overrides: Record<string, unknown> = {}) {
  return {
    evaluationId: "e1",
    decision: "fire" as const,
    tier: "NUDGE",
    compositeScore: 60,
    interventionType: "nudge",
    frictionIds: [] as string[],
    narrative: "n",
    signals: { intent: 50, friction: 40, clarity: 50, receptivity: 50, value: 50 },
    reasoning: "r",
    recommendedAction: "nudge_suggestion",
    engine: "fast" as const,
    ...overrides,
  };
}

function call(extra: Record<string, unknown> = {}) {
  return updateVisitorMindFromEvaluation({
    sessionId: "s1",
    siteUrl: "https://shop.dev",
    result: fakeResult(extra.result as Record<string, unknown> | undefined) as never,
    events: (extra.events as never) ?? [],
  });
}

beforeEach(() => {
  recordMoodTransition.mockClear();
  updateScalar.mockClear();
  addInferredObjection.mockClear();
});

describe("mood derivation", () => {
  it("exit_intent → leaving", async () => {
    await call({ events: [{ eventType: "exit_intent" }] });
    expect(recordMoodTransition).toHaveBeenCalledWith(
      "s1", "https://shop.dev", "leaving", expect.any(String),
    );
  });

  it("friction ≥75 → frustrated (overrides composite)", async () => {
    await call({
      result: {
        compositeScore: 85,
        signals: { intent: 80, friction: 80, clarity: 60, receptivity: 60, value: 60 },
      },
    });
    expect(recordMoodTransition.mock.calls[0][2]).toBe("frustrated");
  });

  it("composite ≥70 + friction<40 → confident", async () => {
    await call({
      result: {
        compositeScore: 78,
        signals: { intent: 80, friction: 20, clarity: 60, receptivity: 70, value: 80 },
      },
    });
    expect(recordMoodTransition.mock.calls[0][2]).toBe("confident");
  });

  it("composite 55..69 → engaged", async () => {
    await call({
      result: {
        compositeScore: 60,
        signals: { intent: 50, friction: 30, clarity: 60, receptivity: 60, value: 60 },
      },
    });
    expect(recordMoodTransition.mock.calls[0][2]).toBe("engaged");
  });

  it("composite <55 + friction ≥40 → hesitant", async () => {
    await call({
      result: {
        compositeScore: 40,
        signals: { intent: 30, friction: 50, clarity: 50, receptivity: 50, value: 40 },
      },
    });
    expect(recordMoodTransition.mock.calls[0][2]).toBe("hesitant");
  });

  it("ambiguous (low signals) → no mood transition recorded", async () => {
    await call({
      result: {
        compositeScore: 30,
        signals: { intent: 30, friction: 20, clarity: 50, receptivity: 50, value: 30 },
      },
    });
    expect(recordMoodTransition).not.toHaveBeenCalled();
  });
});

describe("scalar updates", () => {
  it("always writes decisionPressure + priceSensitivity + confidence", async () => {
    await call();
    expect(updateScalar).toHaveBeenCalledTimes(1);
    const arg = updateScalar.mock.calls[0][2];
    expect(typeof arg.decisionPressure).toBe("number");
    expect(typeof arg.priceSensitivity).toBe("number");
    expect(typeof arg.confidence).toBe("number");
    expect(arg.lastEvaluationId).toBe("e1");
  });

  it("price-coded frictions bump priceSensitivity", async () => {
    await call({
      result: { frictionIds: ["F117", "F060"] }, // both price
    });
    const arg = updateScalar.mock.calls[0][2];
    expect(arg.priceSensitivity).toBeGreaterThan(60);
  });

  it("LLM engine raises confidence over fast", async () => {
    await call({ result: { engine: "fast" } });
    const fastConf = updateScalar.mock.calls[0][2].confidence as number;
    updateScalar.mockClear();
    await call({ result: { engine: "llm" } });
    const llmConf = updateScalar.mock.calls[0][2].confidence as number;
    expect(llmConf).toBeGreaterThan(fastConf);
  });
});

describe("inferred objections", () => {
  it("F117 maps to price objection", async () => {
    await call({ result: { frictionIds: ["F117"] } });
    expect(addInferredObjection).toHaveBeenCalledTimes(1);
    expect(addInferredObjection.mock.calls[0][2].type).toBe("price");
  });

  it("multiple frictions emit multiple objections", async () => {
    await call({ result: { frictionIds: ["F117", "F094"] } }); // price + trust
    expect(addInferredObjection).toHaveBeenCalledTimes(2);
    const types = addInferredObjection.mock.calls.map((c) => c[2].type);
    expect(types).toContain("price");
    expect(types).toContain("trust");
  });

  it("unmapped friction IDs are ignored", async () => {
    await call({ result: { frictionIds: ["F999"] } });
    expect(addInferredObjection).not.toHaveBeenCalled();
  });

  it("confidence is clamped to [0, 1]", async () => {
    await call({
      result: {
        frictionIds: ["F117"],
        signals: { intent: 0, friction: 150, clarity: 0, receptivity: 0, value: 0 },
      },
    });
    expect(addInferredObjection.mock.calls[0][2].confidence).toBeLessThanOrEqual(1);
  });
});

describe("error safety", () => {
  it("swallows repo errors without throwing", async () => {
    recordMoodTransition.mockRejectedValueOnce(new Error("DB down"));
    await expect(call({ events: [{ eventType: "exit_intent" }] })).resolves.toBeUndefined();
  });
});
