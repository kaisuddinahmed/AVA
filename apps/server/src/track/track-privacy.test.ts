// ============================================================================
// Phase 2.1 — WS dispatcher privacy regression test (Codex P2).
//
// Codex flagged that the voice-responder.gate.test.ts called the responder
// directly and so missed the leak in track.handlers.ts:51 where the WS
// dispatcher itself logged the raw transcript before the responder ran.
//
// This test exercises the FULL dispatch path: `handleTrackMessage()` parses
// the voice_query WS frame, then routes to the responder. We assert the
// transcript NEVER appears verbatim in any logger call across that entire
// path.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks: voice-responder is exercised separately, here we just need the WS
// path to *parse and dispatch* without exploding. Mock everything downstream.
vi.mock("../voice/voice-responder.service.ts", () => ({
  handleVoiceQuery: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api/agent.api.ts", () => ({
  handleAgentWsMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../intervene/intervene.service.ts", () => ({
  recordInterventionOutcome: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./track.service.ts", () => ({
  processTrackEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@ava/db", () => ({
  InterventionFeedbackRepo: { upsertFeedback: vi.fn().mockResolvedValue({}) },
  TrainingDatapointRepo: { recordOutcome: vi.fn().mockResolvedValue({}) },
}));

import type { WebSocket } from "ws";
import { logger } from "../logger.js";

// `track.handlers.ts` captures `logger.child(...)` at module load. Spy + then
// dynamic-import so the spy is in place BEFORE the child logger is bound.
const loggerCalls: unknown[][] = [];
for (const level of ["info", "warn", "error", "debug"] as const) {
  vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args);
    return undefined as never;
  });
}
vi.spyOn(logger, "child").mockReturnValue(logger);

const { handleTrackMessage } = await import("./track.handlers.js");

beforeEach(() => {
  loggerCalls.length = 0;
});

function fakeWs(): WebSocket {
  return { send: vi.fn() } as unknown as WebSocket;
}

describe("Phase 2.1 — WS dispatcher privacy gate (Codex P2)", () => {
  it("voice_query through handleTrackMessage does NOT log the raw transcript", () => {
    const needle = "MY-DISPATCHER-SECRET-FIND-ME-IN-LOGS-99887766";
    handleTrackMessage(fakeWs(), {
      type: "voice_query",
      session_id: "sess_dispatcher_test",
      transcript: needle,
      timestamp: Date.now(),
      page_context: { page_type: "pdp", page_url: "https://shop.example/products/x" },
    });
    const flat = JSON.stringify(loggerCalls);
    expect(
      flat.includes(needle),
      `Raw transcript leaked into logger output. Captured calls:\n${flat.slice(0, 800)}`,
    ).toBe(false);
  });

  it("the dispatcher logs the transcript length, not its content", () => {
    handleTrackMessage(fakeWs(), {
      type: "voice_query",
      session_id: "sess_dispatcher_test_2",
      transcript: "twelve chars",
      timestamp: Date.now(),
      page_context: { page_type: "pdp", page_url: "https://shop.example/p" },
    });
    const flat = JSON.stringify(loggerCalls);
    expect(flat).toMatch(/\(12 chars\)/);
    expect(flat.includes("twelve chars")).toBe(false);
  });
});
