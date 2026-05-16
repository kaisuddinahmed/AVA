// ============================================================================
// streaming-stt.service — Phase 2.5 unit tests.
//
// Mocked WebSocket — no Deepgram calls in CI.
//
// Asserts:
//   - Feature-flag gating.
//   - sendSttAudio forwards binary chunks upstream.
//   - Partial Deepgram messages broadcast as `voice_partial`.
//   - Final Deepgram messages broadcast as `voice_final` AND call onFinal.
//   - endSttStream sends CloseStream + cleans up.
//   - cancelSttStream is immediate, doesn't flush.
//   - No raw transcript ever appears in any log call (privacy invariant).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const broadcasts: Array<{ ch: string; sid: string; msg: Record<string, unknown> }> = [];
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn((ch: string, sid: string, msg: Record<string, unknown>) => {
    broadcasts.push({ ch, sid, msg });
  }),
}));
vi.mock("../config.js", () => ({
  config: { voice: { deepgramApiKey: "stub-key" } },
}));

import { logger } from "../logger.js";
import type {
  SttWebSocket,
  SttWsFactory,
} from "./streaming-stt.service.js";

// Spy on logger BEFORE the module captures `logger.child({...})` at load.
const loggerCalls: unknown[][] = [];
for (const level of ["info", "warn", "error", "debug"] as const) {
  vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args);
    return undefined as never;
  });
}
vi.spyOn(logger, "child").mockReturnValue(logger);

const {
  startSttStream,
  sendSttAudio,
  endSttStream,
  cancelSttStream,
  isSttStreamActive,
  __resetSttSessions,
} = await import("./streaming-stt.service.js");

type Listeners = Partial<Record<"open" | "message" | "error" | "close", Array<(arg?: unknown) => void>>>;

interface FakeWs {
  ws: SttWebSocket;
  emit: (ev: keyof Listeners, arg?: unknown) => void;
  sent: unknown[];
}
function fakeWs(): FakeWs {
  const sent: unknown[] = [];
  const listeners: Listeners = {};
  const ws: SttWebSocket = {
    on(event, listener) {
      (listeners[event] ??= []).push(listener as (arg?: unknown) => void);
    },
    send(data) { sent.push(data); },
    close() { /* no-op */ },
  };
  return {
    ws,
    emit: (ev, arg) => (listeners[ev] ?? []).forEach((fn) => fn(arg)),
    sent,
  };
}

beforeEach(() => {
  __resetSttSessions();
  broadcasts.length = 0;
  loggerCalls.length = 0;
});

// ── Feature flag ────────────────────────────────────────────────────────────

describe("streaming-stt — feature flag", () => {
  it("disabled flag → outcome=disabled, no session registered", () => {
    const factory = vi.fn();
    const r = startSttStream({
      sessionId: "s_off",
      config: { enabled: false },
      wsFactory: factory as unknown as SttWsFactory,
    });
    expect(r).toEqual({ active: false, outcome: "disabled" });
    expect(isSttStreamActive("s_off")).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it("missing API key → outcome=error", () => {
    const r = startSttStream({
      sessionId: "s_no_key",
      config: { enabled: true, apiKey: "" },
    });
    expect(r.outcome).toBe("error");
  });

  it("starting twice for the same sessionId returns outcome=exists (idempotent)", () => {
    const fakes: FakeWs[] = [];
    const factory: SttWsFactory = () => {
      const f = fakeWs();
      fakes.push(f);
      return f.ws;
    };
    const r1 = startSttStream({ sessionId: "s_dup", config: { enabled: true }, wsFactory: factory });
    const r2 = startSttStream({ sessionId: "s_dup", config: { enabled: true }, wsFactory: factory });
    expect(r1.outcome).toBe("started");
    expect(r2.outcome).toBe("exists");
    expect(fakes).toHaveLength(1);
  });
});

// ── Forwarding + transcripts ────────────────────────────────────────────────

describe("streaming-stt — chunk forwarding + transcript broadcast", () => {
  it("sendSttAudio forwards binary chunks upstream once WS is open", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_fwd",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("open");
    const sent = sendSttAudio("s_fwd", Buffer.from([0x01, 0x02, 0x03]));
    expect(sent).toBe(true);
    expect(fake.sent).toHaveLength(1);
    expect(Buffer.isBuffer(fake.sent[0])).toBe(true);
    expect((fake.sent[0] as Buffer).length).toBe(3);
  });

  it("audio sent BEFORE upstream `open` is queued, flushed on open (Codex P1#2)", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_preopen",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    // Send three chunks before the handshake completes.
    expect(sendSttAudio("s_preopen", Buffer.from([0xaa]))).toBe(true);
    expect(sendSttAudio("s_preopen", Buffer.from([0xbb, 0xbb]))).toBe(true);
    expect(sendSttAudio("s_preopen", Buffer.from([0xcc, 0xcc, 0xcc]))).toBe(true);
    // Nothing has been forwarded yet — the WS isn't open.
    expect(fake.sent).toHaveLength(0);

    fake.emit("open");

    // All three queued chunks now hit the upstream in order.
    expect(fake.sent).toHaveLength(3);
    expect((fake.sent[0] as Buffer).length).toBe(1);
    expect((fake.sent[1] as Buffer).length).toBe(2);
    expect((fake.sent[2] as Buffer).length).toBe(3);
  });

  it("empty chunk is rejected without forwarding", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_empty",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    expect(sendSttAudio("s_empty", Buffer.alloc(0))).toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it("partial transcript → voice_partial broadcast (no onFinal call)", () => {
    const onFinal = vi.fn();
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_partial",
      config: { enabled: true },
      wsFactory: () => fake.ws,
      onFinal,
    });
    fake.emit("message", JSON.stringify({
      is_final: false,
      channel: { alternatives: [{ transcript: "hello there" }] },
    }));
    const partials = broadcasts.filter((b) => b.msg.type === "voice_partial");
    expect(partials).toHaveLength(1);
    expect(partials[0]!.msg.transcript).toBe("hello there");
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("final transcript → voice_final broadcast AND onFinal called", () => {
    const onFinal = vi.fn();
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_final",
      config: { enabled: true },
      wsFactory: () => fake.ws,
      onFinal,
    });
    fake.emit("message", JSON.stringify({
      is_final: true,
      channel: { alternatives: [{ transcript: "show me the linen tee" }] },
    }));
    const finals = broadcasts.filter((b) => b.msg.type === "voice_final");
    expect(finals).toHaveLength(1);
    expect(finals[0]!.msg.transcript).toBe("show me the linen tee");
    expect(onFinal).toHaveBeenCalledWith("show me the linen tee");
  });

  it("empty transcript is ignored (no broadcast)", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_empty_tr",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("message", JSON.stringify({
      is_final: true,
      channel: { alternatives: [{ transcript: "   " }] },
    }));
    expect(broadcasts).toHaveLength(0);
  });
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe("streaming-stt — endSttStream + cancelSttStream", () => {
  it("endSttStream sends CloseStream then waits for upstream close before tearing down (Codex P1#1)", async () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_end",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    // Open the upstream so audio can be sent.
    fake.emit("open");
    sendSttAudio("s_end", Buffer.from([0x01, 0x02]));

    // Kick off endSttStream BUT don't await it yet — we need to inspect
    // state mid-flight before the upstream emits its final/close events.
    const closePromise = endSttStream("s_end");
    // CloseStream control was sent…
    expect(fake.sent.some((s) => typeof s === "string" && s.includes("CloseStream"))).toBe(true);
    // …but the session is NOT yet dropped. We're waiting for the upstream
    // to emit its final transcript. Old behaviour would have already torn down.
    expect(isSttStreamActive("s_end")).toBe(true);

    // Upstream emits a final transcript AFTER CloseStream, then closes.
    fake.emit("message", JSON.stringify({
      is_final: true,
      channel: { alternatives: [{ transcript: "done" }] },
    }));
    fake.emit("close");

    const stats = await closePromise;
    expect(stats.outcome).toBe("complete");
    expect(stats.finals).toBe(1);
    expect(stats.bytesForwarded).toBe(2);
    expect(isSttStreamActive("s_end")).toBe(false);
  });

  it("endSttStream resolves on grace timeout when upstream never closes", async () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_grace",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("open");
    sendSttAudio("s_grace", Buffer.from([0x07]));

    process.env.DEEPGRAM_STT_FINALIZE_GRACE_MS = "30";
    const stats = await endSttStream("s_grace");
    // Grace expired without an upstream close event → timeout.
    expect(stats.outcome).toBe("timeout");
    expect(isSttStreamActive("s_grace")).toBe(false);
    delete process.env.DEEPGRAM_STT_FINALIZE_GRACE_MS;
  });

  // Codex Phase 2.5 round 2:
  // Clean upstream close with no finals (e.g. silence / VAD detected nothing)
  // is a valid completion, not a timeout.
  it("clean close with no final transcripts → outcome=complete, not timeout (Codex P2)", async () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_silence",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("open");
    sendSttAudio("s_silence", Buffer.from([0x00, 0x00, 0x00]));

    const closePromise = endSttStream("s_silence");
    // Upstream closes cleanly without ever emitting a transcript.
    fake.emit("close");
    const stats = await closePromise;
    expect(stats.outcome).toBe("complete");
    expect(stats.finals).toBe(0);
  });

  // Codex Phase 2.5 round 2:
  // End-before-open path: queued audio must flush AFTER the upstream open,
  // BEFORE CloseStream is sent. Previously hard-closed with "error" and
  // dropped short utterances (shopper speaks + releases mic in the open
  // window).
  it("endSttStream called before open: waits for open, flushes queue, then CloseStream (Codex P1)", async () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_end_before_open",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    // Queue audio while still pre-open.
    sendSttAudio("s_end_before_open", Buffer.from([0xaa]));
    sendSttAudio("s_end_before_open", Buffer.from([0xbb, 0xbb]));
    // Nothing forwarded yet.
    expect(fake.sent).toHaveLength(0);

    // Caller asks to end the session BEFORE the upstream open event arrives.
    const closePromise = endSttStream("s_end_before_open");

    // A tick later, upstream opens.
    setTimeout(() => {
      fake.emit("open");
      // Then closes cleanly.
      setTimeout(() => fake.emit("close"), 5);
    }, 5);

    const stats = await closePromise;
    expect(stats.outcome).toBe("complete");

    // The two queued audio chunks were flushed BEFORE the CloseStream control.
    const order = fake.sent.map((s) =>
      Buffer.isBuffer(s) ? "audio" : (typeof s === "string" && s.includes("CloseStream") ? "close" : "other"),
    );
    expect(order.indexOf("audio")).toBeLessThan(order.indexOf("close"));
    expect(order.filter((x) => x === "audio")).toHaveLength(2);
    expect(order.filter((x) => x === "close")).toHaveLength(1);
  });

  it("endSttStream called before open: if upstream NEVER opens within the budget → outcome=error", async () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_no_open",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    sendSttAudio("s_no_open", Buffer.from([0x01]));

    // Force a tiny grace so the test finishes quickly. The "open budget" is
    // capped at min(grace, 750ms).
    process.env.DEEPGRAM_STT_FINALIZE_GRACE_MS = "20";
    const stats = await endSttStream("s_no_open");
    expect(stats.outcome).toBe("error");
    delete process.env.DEEPGRAM_STT_FINALIZE_GRACE_MS;
  });

  it("cancelSttStream is immediate, returns cancelled, no CloseStream sent", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_cancel",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    const stats = cancelSttStream("s_cancel");
    expect(stats.outcome).toBe("cancelled");
    expect(isSttStreamActive("s_cancel")).toBe(false);
    expect(fake.sent.some((s) => typeof s === "string" && s.includes("CloseStream"))).toBe(false);
  });

  it("WS error event → session ends with error outcome, no exception bubbles up", () => {
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_err",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("error", new Error("DNS"));
    expect(isSttStreamActive("s_err")).toBe(false);
  });
});

// ── Privacy gate (CLAUDE.md hard rule + Codex Phase 2.0) ────────────────────

describe("streaming-stt — privacy: no transcript content in logger args", () => {
  it("a unique transcript string never appears verbatim in any log call", () => {
    const needle = "MY-STT-SECRET-NEEDLE-XYZ-0123456789";
    const fake = fakeWs();
    startSttStream({
      sessionId: "s_priv",
      config: { enabled: true },
      wsFactory: () => fake.ws,
    });
    fake.emit("message", JSON.stringify({
      is_final: true,
      channel: { alternatives: [{ transcript: needle }] },
    }));
    const flat = JSON.stringify(loggerCalls);
    expect(flat.includes(needle), `Transcript leaked into logger:\n${flat.slice(0, 600)}`).toBe(false);
    // Telemetry only — length should be present.
    expect(flat).toMatch(/finalLen/);
  });
});
