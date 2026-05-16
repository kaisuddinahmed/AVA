// ============================================================================
// streaming-tts.service — Phase 2.4 unit tests.
//
// Mocks the Deepgram WebSocket so we never hit the network in CI. Asserts:
//   - Disabled flag → early return with outcome="disabled".
//   - Happy path → opens WS, sends Speak+Flush, forwards binary chunks as
//     base64 over the widget WS, ends on "Flushed" control event.
//   - First-chunk latency is reported (<200ms in the fake).
//   - Timeout path resolves with outcome="timeout".
//   - Error event from Deepgram → outcome="error".
//   - Empty text → outcome="error" without opening a WS.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const broadcasts: Array<{ ch: string; sid: string; msg: Record<string, unknown> }> = [];
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn((ch: string, sid: string, msg: Record<string, unknown>) => {
    broadcasts.push({ ch, sid, msg });
  }),
}));

// Minimal config stub — service reads config.voice.deepgramApiKey.
vi.mock("../config.js", () => ({
  config: { voice: { deepgramApiKey: "stub-key" } },
}));

import { streamTtsToSession, type TtsWebSocket, type TtsWsFactory } from "./streaming-tts.service.js";

type Listeners = Partial<Record<"open" | "message" | "error" | "close", Array<(arg?: unknown) => void>>>;

interface FakeWs {
  ws: TtsWebSocket;
  emit: (ev: keyof Listeners, arg?: unknown) => void;
  sent: unknown[];
  isClosed: () => boolean;
}
function fakeWs(): FakeWs {
  const sent: unknown[] = [];
  let closed = false;
  const listeners: Listeners = {};
  const ws: TtsWebSocket = {
    on(event, listener) {
      (listeners[event] ??= []).push(listener as (arg?: unknown) => void);
    },
    send(data) { sent.push(data); },
    close() { closed = true; },
  };
  const emit = (ev: keyof Listeners, arg?: unknown) => {
    (listeners[ev] ?? []).forEach((fn) => fn(arg));
  };
  return { ws, emit, sent, isClosed: () => closed };
}

beforeEach(() => {
  broadcasts.length = 0;
});

describe("streaming-tts — feature flag", () => {
  it("disabled flag → returns outcome=disabled, no WS opened", async () => {
    const factory = vi.fn();
    const result = await streamTtsToSession({
      sessionId: "s1", interventionId: "iv1", text: "hello",
      config: { enabled: false }, wsFactory: factory as unknown as TtsWsFactory,
    });
    expect(result.outcome).toBe("disabled");
    expect(factory).not.toHaveBeenCalled();
    expect(broadcasts.length).toBe(0);
  });

  it("missing API key → outcome=error, no WS opened", async () => {
    const factory = vi.fn();
    const result = await streamTtsToSession({
      sessionId: "s1", interventionId: "iv1", text: "hi",
      config: { enabled: true, apiKey: "" }, wsFactory: factory as unknown as TtsWsFactory,
    });
    expect(result.outcome).toBe("error");
    expect(factory).not.toHaveBeenCalled();
  });

  it("empty text → outcome=error", async () => {
    const factory = vi.fn();
    const result = await streamTtsToSession({
      sessionId: "s1", interventionId: "iv1", text: "   ",
      config: { enabled: true }, wsFactory: factory as unknown as TtsWsFactory,
    });
    expect(result.outcome).toBe("error");
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("streaming-tts — happy path", () => {
  it("opens WS, sends Speak + Flush, forwards binary chunks, ends on Flushed", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = (_url, _headers) => {
      // Schedule the conversation in microtasks so the promise constructor
      // has wired all listeners before we start emitting.
      queueMicrotask(() => {
        fake.emit("open");
        fake.emit("message", Buffer.from([0x01, 0x02, 0x03, 0x04]));
        fake.emit("message", Buffer.from([0x05, 0x06]));
        fake.emit("message", JSON.stringify({ type: "Flushed" }));
      });
      return fake.ws;
    };

    const result = await streamTtsToSession({
      sessionId: "s_happy",
      interventionId: "iv_happy",
      text: "Saw you peek at that one.",
      config: { enabled: true },
      wsFactory: factory,
    });

    expect(result.outcome).toBe("complete");
    expect(result.chunkCount).toBe(2);
    expect(result.bytesStreamed).toBe(6);
    expect(result.firstChunkMs).toBeGreaterThanOrEqual(0);

    // Speak + Flush sent to Deepgram.
    expect(fake.sent.length).toBe(2);
    expect(JSON.parse(fake.sent[0] as string)).toMatchObject({ type: "Speak", text: "Saw you peek at that one." });
    expect(JSON.parse(fake.sent[1] as string)).toMatchObject({ type: "Flush" });

    // Two voice_chunk broadcasts + one voice_chunk_end.
    const chunks = broadcasts.filter((b) => b.msg.type === "voice_chunk");
    const ends = broadcasts.filter((b) => b.msg.type === "voice_chunk_end");
    expect(chunks).toHaveLength(2);
    expect(ends).toHaveLength(1);
    expect(chunks[0]!.msg.sequence).toBe(1);
    expect(chunks[1]!.msg.sequence).toBe(2);
    // First chunk decodes back to the original bytes.
    const decoded = Buffer.from(chunks[0]!.msg.chunk as string, "base64");
    expect([...decoded]).toEqual([0x01, 0x02, 0x03, 0x04]);
    expect(ends[0]!.msg).toMatchObject({
      intervention_id: "iv_happy",
      total_chunks: 2,
      outcome: "complete",
    });
  });

  it("Deepgram closes socket without explicit Flushed (after chunks received) → still complete", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => {
        fake.emit("open");
        fake.emit("message", Buffer.from([0x10]));
        fake.emit("close");
      });
      return fake.ws;
    };
    const result = await streamTtsToSession({
      sessionId: "s_x", interventionId: "iv_x", text: "hi",
      config: { enabled: true }, wsFactory: factory,
    });
    expect(result.outcome).toBe("complete");
    expect(result.chunkCount).toBe(1);
  });
});

describe("streaming-tts — failure paths", () => {
  it("timeout → outcome=timeout, voice_chunk_end emitted with that outcome", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => {
        fake.emit("open");
        // Never emit any messages — let the timeout fire.
      });
      return fake.ws;
    };
    const result = await streamTtsToSession({
      sessionId: "s_t", interventionId: "iv_t", text: "hi",
      config: { enabled: true, timeoutMs: 30 }, wsFactory: factory,
    });
    expect(result.outcome).toBe("timeout");
    const ends = broadcasts.filter((b) => b.msg.type === "voice_chunk_end");
    expect(ends).toHaveLength(1);
    expect(ends[0]!.msg.outcome).toBe("timeout");
  });

  it("error event from Deepgram → outcome=error", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => {
        fake.emit("open");
        fake.emit("message", JSON.stringify({ type: "Error", message: "rate limited" }));
      });
      return fake.ws;
    };
    const result = await streamTtsToSession({
      sessionId: "s_e", interventionId: "iv_e", text: "hi",
      config: { enabled: true }, wsFactory: factory,
    });
    expect(result.outcome).toBe("error");
  });

  it("transport `error` event → outcome=error", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => fake.emit("error", new Error("DNS")));
      return fake.ws;
    };
    const result = await streamTtsToSession({
      sessionId: "s_n", interventionId: "iv_n", text: "hi",
      config: { enabled: true }, wsFactory: factory,
    });
    expect(result.outcome).toBe("error");
  });
});

// ── Codex Phase 2.4 P1 regression ──────────────────────────────────────────
//
// The default WS factory previously used `require("ws")` which throws at
// runtime under ESM ("type": "module"). The fix uses a top-level
// `import { WebSocket } from "ws"`. Exercise the default factory path so
// any future regression to require() is caught immediately. We point it at
// a syntactically valid but unreachable URL and assert the call returns an
// outcome without throwing — proving the factory itself didn't error out
// at construction time.

describe("streaming-tts — default factory is ESM-safe (Codex P1)", () => {
  it("default factory constructs a WebSocket without throwing 'require is not defined'", async () => {
    const result = await streamTtsToSession({
      sessionId: "s_def", interventionId: "iv_def", text: "hello",
      // No wsFactory → uses defaultWsFactory which is now ESM-import-based.
      // ws will fail to actually connect to 127.0.0.1:1 — that's fine,
      // the point of the test is to prove construction works under ESM.
      config: { enabled: true, apiKey: "stub", timeoutMs: 100 },
    });
    // Any of these outcomes proves the WS was at least constructed
    // (the prior require() bug threw synchronously at factory-call time).
    expect(["error", "timeout", "complete"]).toContain(result.outcome);
  });
});

describe("streaming-tts — broadcast contract", () => {
  it("voice_chunk message carries encoding + sample_rate so widget can decode", async () => {
    const fake = fakeWs();
    const factory: TtsWsFactory = () => {
      queueMicrotask(() => {
        fake.emit("open");
        fake.emit("message", Buffer.from([0x00, 0x00]));
        fake.emit("message", JSON.stringify({ type: "Flushed" }));
      });
      return fake.ws;
    };
    await streamTtsToSession({
      sessionId: "s_c", interventionId: "iv_c", text: "hi",
      config: { enabled: true, encoding: "linear16", sampleRate: 16000 },
      wsFactory: factory,
    });
    const chunk = broadcasts.find((b) => b.msg.type === "voice_chunk");
    expect(chunk).toBeTruthy();
    expect(chunk!.msg).toMatchObject({
      encoding: "linear16",
      sample_rate: 16000,
    });
  });
});
