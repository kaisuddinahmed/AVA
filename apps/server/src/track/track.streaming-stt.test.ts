// ============================================================================
// Phase 2.7 — WS dispatcher streaming STT + barge-in tests.
//
// Exercises handleTrackMessage() with the four new frame types:
//   voice_stream_start, audio_chunk, voice_stream_end, tts_cancel
//
// Asserts:
//   - voice_stream_start opens an STT session AND cancels in-flight TTS.
//   - audio_chunk decodes base64 + forwards to streaming-stt.
//   - voice_stream_end closes the STT session.
//   - tts_cancel cancels TTS for the session.
//   - Each path acks the widget so the round-trip is observable.
//   - No raw transcript appears in any logger arg.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the services so we observe dispatcher routing only ─────────────────

const sttStart = vi.fn();
const sttSend = vi.fn().mockReturnValue(true);
const sttEnd = vi.fn().mockResolvedValue({
  bytesForwarded: 5,
  partials: 1,
  finals: 1,
  durationMs: 42,
  outcome: "complete" as const,
});
const ttsCancel = vi.fn().mockReturnValue(true);

vi.mock("../voice/streaming-stt.service.js", () => ({
  startSttStream: (...args: unknown[]) => sttStart(...args) ?? { active: true, outcome: "started" },
  sendSttAudio: (...args: unknown[]) => sttSend(...args),
  endSttStream: (...args: unknown[]) => sttEnd(...args),
}));
vi.mock("../voice/streaming-tts.service.js", () => ({
  cancelTtsStream: (...args: unknown[]) => ttsCancel(...args),
  isTtsStreamActive: vi.fn().mockReturnValue(false),
}));
vi.mock("../voice/voice-responder.service.js", () => ({
  handleVoiceQuery: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api/agent.api.js", () => ({
  handleAgentWsMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../intervene/intervene.service.js", () => ({
  recordInterventionOutcome: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./track.service.js", () => ({
  processTrackEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@ava/db", () => ({
  InterventionFeedbackRepo: { upsertFeedback: vi.fn().mockResolvedValue({}) },
  TrainingDatapointRepo: { recordOutcome: vi.fn().mockResolvedValue({}) },
}));

import type { WebSocket } from "ws";
import { logger } from "../logger.js";

// Spy on logger BEFORE dynamic-importing the dispatcher so the child logger
// is captured at module load (same trick as track-privacy.test.ts).
const loggerCalls: unknown[][] = [];
for (const level of ["info", "warn", "error", "debug"] as const) {
  vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args);
    return undefined as never;
  });
}
vi.spyOn(logger, "child").mockReturnValue(logger);

const { handleTrackMessage } = await import("./track.handlers.js");

interface FakeWs { sent: unknown[]; ws: WebSocket }
function fakeWs(): FakeWs {
  const sent: unknown[] = [];
  return {
    sent,
    ws: { send: (data: unknown) => sent.push(data) } as unknown as WebSocket,
  };
}

beforeEach(() => {
  sttStart.mockClear();
  sttSend.mockClear().mockReturnValue(true);
  sttEnd.mockClear().mockResolvedValue({
    bytesForwarded: 5, partials: 1, finals: 1, durationMs: 42, outcome: "complete",
  });
  ttsCancel.mockClear().mockReturnValue(true);
  loggerCalls.length = 0;
});

// ── voice_stream_start ──────────────────────────────────────────────────────

describe("dispatcher — voice_stream_start", () => {
  it("opens STT session and cancels in-flight TTS (barge-in)", () => {
    const ws = fakeWs();
    handleTrackMessage(ws.ws, { type: "voice_stream_start", session_id: "s_barge" });
    expect(sttStart).toHaveBeenCalledTimes(1);
    expect(ttsCancel).toHaveBeenCalledWith("s_barge");
    // Ack carries barge_in_cancelled=true so the widget can stop its audio queue.
    const ack = JSON.parse(ws.sent[0] as string);
    expect(ack).toMatchObject({ type: "voice_stream_ack", session_id: "s_barge", barge_in_cancelled: true });
  });

  it("ack reflects barge_in_cancelled=false when no TTS was active", () => {
    ttsCancel.mockReturnValueOnce(false);
    const ws = fakeWs();
    handleTrackMessage(ws.ws, { type: "voice_stream_start", session_id: "s_no_tts" });
    const ack = JSON.parse(ws.sent[0] as string);
    expect(ack.barge_in_cancelled).toBe(false);
  });
});

// ── audio_chunk ─────────────────────────────────────────────────────────────

describe("dispatcher — audio_chunk", () => {
  it("base64-decodes the chunk and forwards to streaming-stt", () => {
    const ws = fakeWs();
    const payload = Buffer.from([0x10, 0x20, 0x30]).toString("base64");
    handleTrackMessage(ws.ws, { type: "audio_chunk", session_id: "s1", chunk: payload });
    expect(sttSend).toHaveBeenCalledTimes(1);
    const [sid, buf] = sttSend.mock.calls[0]!;
    expect(sid).toBe("s1");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect([...(buf as Buffer)]).toEqual([0x10, 0x20, 0x30]);
  });

  it("emits an error ack when streaming-stt rejects (no active session)", () => {
    sttSend.mockReturnValueOnce(false);
    const ws = fakeWs();
    handleTrackMessage(ws.ws, {
      type: "audio_chunk", session_id: "s_dead",
      chunk: Buffer.from([0x01]).toString("base64"),
    });
    const err = JSON.parse(ws.sent[0] as string);
    expect(err).toMatchObject({ type: "audio_chunk_error", session_id: "s_dead", error: "no_active_stream" });
  });

  // Codex Phase 2.7 P2 — base64 validation hardening
  it("rejects audio_chunk with non-base64 alphabet (validation fails, sttSend not called)", () => {
    const ws = fakeWs();
    handleTrackMessage(ws.ws, {
      type: "audio_chunk",
      session_id: "s_bad_alpha",
      chunk: "this has spaces and !@#$ which are not base64",
    });
    // Validation rejected → falls through ALL handler branches → no ack sent
    // by this code path (the dispatcher's catch-all logs "Validation failed").
    expect(sttSend).not.toHaveBeenCalled();
  });

  it("rejects audio_chunk with bad padding length", () => {
    const ws = fakeWs();
    handleTrackMessage(ws.ws, {
      type: "audio_chunk",
      session_id: "s_bad_pad",
      chunk: "abc", // length 3 — not a multiple of 4
    });
    expect(sttSend).not.toHaveBeenCalled();
  });

  it("rejects audio_chunk that round-trips to something different (non-canonical padding)", () => {
    const ws = fakeWs();
    // "aGVsbG8" without proper padding decodes as "hello" but re-encodes to
    // "aGVsbG8=" — the round-trip refine rejects it.
    handleTrackMessage(ws.ws, {
      type: "audio_chunk",
      session_id: "s_rt",
      chunk: "aGVsbG8",
    });
    expect(sttSend).not.toHaveBeenCalled();
  });

  it("accepts canonical base64 (round-trips cleanly)", () => {
    const ws = fakeWs();
    const canonical = Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString("base64");
    handleTrackMessage(ws.ws, {
      type: "audio_chunk",
      session_id: "s_ok",
      chunk: canonical,
    });
    expect(sttSend).toHaveBeenCalledTimes(1);
  });
});

// ── voice_stream_end ────────────────────────────────────────────────────────

describe("dispatcher — voice_stream_end", () => {
  it("closes the STT stream and acks with the outcome", async () => {
    const ws = fakeWs();
    handleTrackMessage(ws.ws, { type: "voice_stream_end", session_id: "s_end" });
    // endSttStream is awaited inside a void IIFE — give it a microtask.
    await new Promise((r) => setTimeout(r, 5));
    expect(sttEnd).toHaveBeenCalledWith("s_end");
    const closed = JSON.parse(ws.sent[0] as string);
    expect(closed).toMatchObject({ type: "voice_stream_closed", session_id: "s_end", outcome: "complete" });
  });
});

// ── tts_cancel ──────────────────────────────────────────────────────────────

describe("dispatcher — tts_cancel", () => {
  it("invokes cancelTtsStream and acks", () => {
    const ws = fakeWs();
    handleTrackMessage(ws.ws, { type: "tts_cancel", session_id: "s_c" });
    expect(ttsCancel).toHaveBeenCalledWith("s_c");
    const ack = JSON.parse(ws.sent[0] as string);
    expect(ack).toMatchObject({ type: "tts_cancel_ack", session_id: "s_c", cancelled: true });
  });
});

// ── Privacy gate (extends Codex Phase 2.0/2.1 invariant) ────────────────────

describe("dispatcher — privacy: no transcript content in logs", () => {
  it("voice_stream_end stats log telemetry only, never transcript content", async () => {
    const needle = "MY-STREAM-SECRET-NEEDLE-0123456789-XYZ";
    // Configure endSttStream to "return" a result that would carry the needle
    // if we ever loosened the contract.
    sttEnd.mockResolvedValueOnce({
      bytesForwarded: needle.length, partials: 1, finals: 1,
      durationMs: 10, outcome: "complete",
    });
    const ws = fakeWs();
    handleTrackMessage(ws.ws, { type: "voice_stream_end", session_id: needle });
    await new Promise((r) => setTimeout(r, 5));
    const flat = JSON.stringify(loggerCalls);
    // The session_id IS the needle — that's by design (it's not a transcript).
    // What MUST be absent: any field claiming to carry the transcript itself.
    // (We assert the dispatcher never invents one.)
    expect(flat.match(/transcript/i)).toBeNull();
  });
});
