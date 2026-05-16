// ============================================================================
// Phase 2.7 — Barge-in regression tests.
//
// Two concerns:
//   1. streaming-tts.service.ts cancelTtsStream() actually cancels an
//      in-flight TTS and the in-promise finishes with outcome="cancelled".
//   2. The WS dispatcher (track.handlers.ts) auto-cancels the TTS when a
//      voice_stream_start arrives. This is the locked-plan barge-in.
//
// Mocks: WS factory injected, no real Deepgram. broadcastToSession captured.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const broadcasts: Array<{ ch: string; sid: string; msg: Record<string, unknown> }> = [];
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn((ch: string, sid: string, msg: Record<string, unknown>) => {
    broadcasts.push({ ch, sid, msg });
  }),
}));
vi.mock("../config.js", () => ({
  config: { voice: { deepgramApiKey: "stub" } },
}));

import {
  streamTtsToSession,
  cancelTtsStream,
  isTtsStreamActive,
  __resetTtsStreams,
  type TtsWebSocket,
  type TtsWsFactory,
} from "./streaming-tts.service.js";

type L = Partial<Record<"open" | "message" | "error" | "close", Array<(arg?: unknown) => void>>>;

function fakeTtsWs() {
  const listeners: L = {};
  const ws: TtsWebSocket = {
    on(ev, fn) { (listeners[ev] ??= []).push(fn as (arg?: unknown) => void); },
    send() { /* swallow */ },
    close() { /* no-op */ },
  };
  return {
    ws,
    emit: (ev: keyof L, arg?: unknown) => (listeners[ev] ?? []).forEach((f) => f(arg)),
  };
}

beforeEach(() => {
  broadcasts.length = 0;
  __resetTtsStreams();
});

describe("Phase 2.7 — cancelTtsStream", () => {
  it("cancelling an in-flight TTS resolves the stream with outcome=cancelled", async () => {
    const fake = fakeTtsWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => {
        fake.emit("open");
        // Start emitting chunks but never reach Flushed.
        fake.emit("message", Buffer.from([0x01]));
        fake.emit("message", Buffer.from([0x02, 0x03]));
        // External cancel will fire while we're mid-stream.
      });
      return fake.ws;
    };

    const promise = streamTtsToSession({
      sessionId: "s_barge", interventionId: "iv_barge", text: "long message",
      config: { enabled: true, timeoutMs: 5000 }, wsFactory: factory,
    });

    // Give the microtask + two messages time to land.
    await new Promise((r) => setTimeout(r, 10));
    expect(isTtsStreamActive("s_barge")).toBe(true);

    const cancelled = cancelTtsStream("s_barge");
    expect(cancelled).toBe(true);

    const result = await promise;
    expect(result.outcome).toBe("cancelled");
    expect(result.chunkCount).toBe(2);
    // voice_chunk_end broadcast carries the cancelled outcome so the widget
    // can stop its audio queue.
    const ends = broadcasts.filter((b) => b.msg.type === "voice_chunk_end");
    expect(ends).toHaveLength(1);
    expect(ends[0]!.msg.outcome).toBe("cancelled");

    expect(isTtsStreamActive("s_barge")).toBe(false);
  });

  it("cancelTtsStream on a session with no active stream returns false", () => {
    expect(cancelTtsStream("nobody")).toBe(false);
  });

  it("starting a new stream for the same session cancels the prior one (most-recent-wins)", async () => {
    const fake1 = fakeTtsWs();
    const fake2 = fakeTtsWs();
    const factories = [fake1, fake2];
    let n = 0;
    const factory: TtsWsFactory = () => {
      const f = factories[n++]!;
      queueMicrotask(() => f.emit("open"));
      return f.ws;
    };

    const p1 = streamTtsToSession({
      sessionId: "s_replace", interventionId: "iv_1", text: "first",
      config: { enabled: true, timeoutMs: 5000 }, wsFactory: factory,
    });
    await new Promise((r) => setTimeout(r, 5));

    // Second stream for the same session — the first should be cancelled.
    const p2 = streamTtsToSession({
      sessionId: "s_replace", interventionId: "iv_2", text: "second",
      config: { enabled: true, timeoutMs: 5000 }, wsFactory: factory,
    });
    await new Promise((r) => setTimeout(r, 5));

    // Force-close the second so its promise resolves too.
    fake2.emit("message", JSON.stringify({ type: "Flushed" }));

    const r1 = await p1;
    const r2 = await p2;
    expect(r1.outcome).toBe("cancelled");
    expect(r2.outcome).toBe("complete");
  });
});
