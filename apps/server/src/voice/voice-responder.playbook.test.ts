// ============================================================================
// Phase 2.3 — F-code playbook integration test.
//
// Verifies that when the latest non-voice evaluation lists a known F-code,
// the voice path emits the playbook's curated voice_script (≤80 chars) AND
// the richer sales_dialog field. Falls back to the LLM-generated voice_script
// when no playbook matches.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ava/db", () => ({
  SessionRepo: {
    getSession: vi.fn().mockResolvedValue({ sessionId: "s1", siteUrl: "https://shop.example", voiceMuted: false }),
    incrementVoiceInterventionsFired: vi.fn().mockResolvedValue({}),
  },
  EvaluationRepo: {
    createEvaluation: vi.fn().mockResolvedValue({ id: "ev_1" }),
    getLatestNonVoiceEvaluation: vi.fn(),
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

vi.mock("groq-sdk", () => ({
  default: class FakeGroq {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "Sure thing — happy to help with that." } }],
        }),
      },
    };
  },
}));

// Capture every broadcast so we can inspect the payload.
const broadcastCalls: Array<{ ch: string; sid: string; msg: Record<string, unknown> }> = [];
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn((ch: string, sid: string, msg: Record<string, unknown>) => {
    broadcastCalls.push({ ch, sid, msg });
  }),
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
  broadcastCalls.length = 0;
  getLatest.mockReset();
});

function lastPayload(): Record<string, unknown> {
  expect(broadcastCalls.length).toBeGreaterThan(0);
  const m = broadcastCalls[broadcastCalls.length - 1]!.msg;
  return (m.payload ?? {}) as Record<string, unknown>;
}

describe("Phase 2.3 — F-code playbook override", () => {
  it("F042 active → voice_script comes from the F042 playbook, sales_dialog populated", async () => {
    getLatest.mockResolvedValueOnce({
      id: "ev_real",
      tier: "ACTIVE",
      frictionsFound: JSON.stringify(["F042"]),
    });
    await handleVoiceQuery(fakeWs(), "s_f042", "tell me more");
    const payload = lastPayload();

    expect(payload.friction_id).toBe("F042");
    // The playbook voice_script is "Saw you peek at that one — want me to find similar styles?"
    expect(payload.voice_script).toMatch(/peek|similar styles/i);
    expect(typeof payload.sales_dialog).toBe("string");
    expect((payload.sales_dialog as string).length).toBeGreaterThan(
      (payload.voice_script as string).length,
    );
  });

  it("F100 active → ships-free playbook chunk + simplifier dialog", async () => {
    getLatest.mockResolvedValueOnce({
      id: "ev_real",
      tier: "NUDGE",
      frictionsFound: JSON.stringify(["F100"]),
    });
    await handleVoiceQuery(fakeWs(), "s_f100", "shipping question");
    const payload = lastPayload();

    expect(payload.friction_id).toBe("F100");
    expect(payload.voice_script).toMatch(/ships free|standard/i);
    expect(payload.sales_dialog).toMatch(/standard/i);
  });

  it("no matching playbook → falls back to LLM voice_script, NO sales_dialog field, and PRESERVES the real friction code (Codex P1)", async () => {
    getLatest.mockResolvedValueOnce({
      id: "ev_unknown",
      tier: "PASSIVE",
      frictionsFound: JSON.stringify(["F123"]), // no playbook for F123
    });
    await handleVoiceQuery(fakeWs(), "s_none", "hello");
    const payload = lastPayload();

    // Codex P1: the real friction code must survive — do NOT rewrite to F036.
    expect(payload.friction_id).toBe("F123");
    expect(payload.sales_dialog).toBeUndefined();
    expect(payload.voice_script).toBeTruthy();
  });

  it("no evaluation at all → falls back to F036 as last resort", async () => {
    getLatest.mockResolvedValueOnce(null);
    await handleVoiceQuery(fakeWs(), "s_first_turn", "hi");
    const payload = lastPayload();
    expect(payload.friction_id).toBe("F036");
    expect(payload.sales_dialog).toBeUndefined();
  });

  it("malformed frictionsFound JSON → falls back to F036 (graceful)", async () => {
    getLatest.mockResolvedValueOnce({
      id: "ev_bad_json",
      tier: "PASSIVE",
      frictionsFound: "not valid json",
    });
    await handleVoiceQuery(fakeWs(), "s_bad", "hi");
    const payload = lastPayload();
    expect(payload.friction_id).toBe("F036");
  });

  it("voice_script emitted by every playbook step is ≤80 chars (sanity over the wire)", async () => {
    // Sanity-check that the integration honours the budget for every known
    // playbook code. Iterate over the known set and confirm.
    const codes = ["F020", "F036", "F042", "F099", "F100", "F128"];
    for (const code of codes) {
      getLatest.mockResolvedValueOnce({
        id: `ev_${code}`,
        tier: "ACTIVE",
        frictionsFound: JSON.stringify([code]),
      });
      await handleVoiceQuery(fakeWs(), `s_${code}`, "hi");
      const payload = lastPayload();
      expect((payload.voice_script as string).length, `${code} voice_script`).toBeLessThanOrEqual(80);
    }
  });
});
