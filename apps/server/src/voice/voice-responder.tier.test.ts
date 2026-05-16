// ============================================================================
// Phase 2.2 — MSWIM-tier-aware system prompt integration test.
//
// Verifies that handleVoiceQuery() looks up the latest Evaluation, extracts
// its tier, and folds the tier-specific directive into the Groq system
// prompt. Mocks Groq + DB so the inspection is deterministic.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every Groq chat call so we can inspect the system prompt content.
const groqCreateCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];

vi.mock("groq-sdk", () => ({
  default: class FakeGroq {
    chat = {
      completions: {
        create: vi.fn(async (args: { messages: Array<{ role: string; content: string }> }) => {
          groqCreateCalls.push(args);
          return { choices: [{ message: { content: "Sure thing." } }] };
        }),
      },
    };
  },
}));

vi.mock("@ava/db", () => ({
  SessionRepo: {
    getSession: vi.fn().mockResolvedValue({ sessionId: "s1", siteUrl: "https://shop.example", voiceMuted: false }),
    incrementVoiceInterventionsFired: vi.fn().mockResolvedValue({}),
  },
  EvaluationRepo: {
    createEvaluation: vi.fn().mockResolvedValue({ id: "ev_1" }),
    // The DUT calls this — we stub it per test. Codex P1: must query the
    // non-voice variant so AVA's own VOICE_REPLY eval doesn't self-shadow.
    getLatestNonVoiceEvaluation: vi.fn(),
    // Keep the old name stubbed too so any accidental regression fails
    // loudly (would be invoked at runtime but never assigned a value here).
    getLatestEvaluation: vi.fn(),
  },
  InterventionRepo: {
    createIntervention: vi.fn().mockResolvedValue({ id: "iv_1" }),
  },
  ConversationStateRepo: {
    getBySession: vi.fn().mockResolvedValue(null),
    appendTurnPair: vi.fn().mockResolvedValue({}),
    getTurnsForLLM: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
    purgeBySession: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn(),
}));
vi.mock("../agent/intent-parser.js", () => ({
  isShoppingRequest: vi.fn().mockReturnValue(false),
}));
vi.mock("../agent/shopping-agent.service.js", () => ({
  handleShoppingQuery: vi.fn(),
  broadcastAgentResponse: vi.fn(),
  clearAgentState: vi.fn().mockResolvedValue(undefined),
}));

process.env.GROQ_API_KEY = "stub";
process.env.VOICE_ENABLED = "true";

import type { WebSocket } from "ws";
import { EvaluationRepo } from "@ava/db";
const { handleVoiceQuery } = await import("./voice-responder.service.js");

function fakeWs(): WebSocket {
  return { send: vi.fn() } as unknown as WebSocket;
}

const getLatest = EvaluationRepo.getLatestNonVoiceEvaluation as ReturnType<typeof vi.fn>;

beforeEach(() => {
  groqCreateCalls.length = 0;
  getLatest.mockReset();
});

describe("Phase 2.2 — tier-aware system prompt", () => {
  it("first turn (no prior evaluation) → defaults to PASSIVE directive", async () => {
    getLatest.mockResolvedValueOnce(null);
    await handleVoiceQuery(fakeWs(), "s_first", "hello");
    const systemContent = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(systemContent).toContain("PASSIVE");
    expect(systemContent).not.toContain("MSWIM tier: ACTIVE");
    expect(systemContent).not.toContain("MSWIM tier: ESCALATE");
  });

  it("MONITOR tier → directive forbids upsell / suggests one short sentence", async () => {
    getLatest.mockResolvedValueOnce({ id: "ev_m", tier: "MONITOR" });
    await handleVoiceQuery(fakeWs(), "s_mon", "browsing");
    const sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(sys).toContain("MSWIM tier: MONITOR");
    expect(sys.toLowerCase()).toMatch(/silent|do not push|one short sentence/);
  });

  it("ACTIVE tier → directive is confident + action-oriented", async () => {
    getLatest.mockResolvedValueOnce({ id: "ev_a", tier: "ACTIVE" });
    await handleVoiceQuery(fakeWs(), "s_act", "do you have linen?");
    const sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(sys).toContain("MSWIM tier: ACTIVE");
    expect(sys.toLowerCase()).toMatch(/confident|recommend/);
  });

  it("ESCALATE tier → directive marks urgent cart-recovery posture", async () => {
    getLatest.mockResolvedValueOnce({ id: "ev_e", tier: "ESCALATE" });
    await handleVoiceQuery(fakeWs(), "s_esc", "should i buy this");
    const sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(sys).toContain("MSWIM tier: ESCALATE");
    expect(sys.toLowerCase()).toMatch(/urgent|at high risk|recovery|objection/);
  });

  it("unknown tier value (mistyped) → PASSIVE fallback (safe default)", async () => {
    getLatest.mockResolvedValueOnce({ id: "ev_x", tier: "AGGRESSIVE" });
    await handleVoiceQuery(fakeWs(), "s_bad", "hey");
    const sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(sys).toContain("MSWIM tier: PASSIVE");
  });

  it("tier-lookup failure (DB blip) → PASSIVE fallback, no exception", async () => {
    getLatest.mockRejectedValueOnce(new Error("DB down"));
    const ws = fakeWs();
    await handleVoiceQuery(ws, "s_err", "hey");
    // Handler still completed (acked the user, didn't throw).
    expect(ws.send).toHaveBeenCalled();
    const sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(sys).toContain("MSWIM tier: PASSIVE");
  });
});

// ── Codex P1 regression test ───────────────────────────────────────────────
//
// Scenario: real friction evaluation lands at ESCALATE. First voice turn
// runs at ESCALATE. The responder writes its own VOICE_REPLY evaluation at
// NUDGE. Next voice turn must STILL use ESCALATE, not the NUDGE that was
// just written. The repo's getLatestNonVoiceEvaluation enforces this; the
// test asserts the contract.

describe("Phase 2.2 — Codex P1: voice eval must not self-shadow real tier", () => {
  it("ESCALATE persists across a voice turn that emits a NUDGE VOICE_REPLY eval", async () => {
    // The repo method we mock represents "latest NON-voice evaluation".
    // Both turns below should see the same ESCALATE row — even after the
    // first turn writes a VOICE_REPLY/NUDGE eval, the filtered query keeps
    // returning the real friction eval.
    getLatest.mockResolvedValue({ id: "ev_real_friction", tier: "ESCALATE" });

    // Turn 1.
    await handleVoiceQuery(fakeWs(), "s_recover", "is shipping fast?");
    const turn1Sys = groqCreateCalls[0]!.messages.find((m) => m.role === "system")!.content;
    expect(turn1Sys).toContain("MSWIM tier: ESCALATE");

    // Turn 2 — must still be ESCALATE, NOT the NUDGE that the voice path
    // synthesizes for its own VOICE_REPLY evaluation.
    await handleVoiceQuery(fakeWs(), "s_recover", "and the return policy?");
    const turn2Sys = groqCreateCalls[1]!.messages.find((m) => m.role === "system")!.content;
    expect(turn2Sys).toContain("MSWIM tier: ESCALATE");
    expect(turn2Sys).not.toContain("MSWIM tier: NUDGE");
  });
});
