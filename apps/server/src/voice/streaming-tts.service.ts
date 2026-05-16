// ============================================================================
// Streaming TTS — Phase 2.4.
//
// Opens a WebSocket to Deepgram's streaming `/v1/speak` endpoint, forwards
// PCM audio chunks to the widget over the existing per-session WS, and
// reports completion. Targets <1s first-chunk latency for the locked Phase 2
// gate.
//
// Architecture (one-shot per voice utterance):
//
//     LLM-generated text                  (server)
//         ↓
//   streamTtsToSession()                  (this module)
//     opens wss://api.deepgram.com/v1/speak?model=aura-...&encoding=linear16
//     sends { type: "Speak", text }
//     sends { type: "Flush" }
//     receives binary PCM frames
//         ↓
//   broadcastToSession("widget", sessionId, {
//     type: "voice_chunk", intervention_id, sequence, chunk: base64
//   })                                    (widget consumes via voice-manager)
//
// Feature-flagged: VOICE_STREAMING_ENABLED=true to turn on. Disabled by
// default so existing REST TTS path stays the production behavior until the
// widget streaming player ships. When disabled, callers fall back to the
// `voice_script` field which the widget plays via the legacy REST proxy.
//
// Tests inject a mock WebSocket so we never hit Deepgram in CI.
// ============================================================================

import { logger } from "../logger.js";
import { broadcastToSession } from "../broadcast/broadcast.service.js";
import { config } from "../config.js";
import { WebSocket } from "ws";

const log = logger.child({ service: "streaming-tts" });

const DEEPGRAM_TTS_WS_URL = "wss://api.deepgram.com/v1/speak";
const DEFAULT_MODEL = "aura-asteria-en";
const DEFAULT_ENCODING = "linear16";   // raw PCM, easy to decode in WebAudio
const DEFAULT_SAMPLE_RATE = 16_000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface StreamingTtsConfig {
  enabled: boolean;
  model: string;
  encoding: string;
  sampleRate: number;
  apiKey: string;
  /** Wall-clock budget for the whole utterance — abort if exceeded. */
  timeoutMs: number;
}

export function getStreamingTtsConfig(): StreamingTtsConfig {
  return {
    enabled: process.env.VOICE_STREAMING_ENABLED === "true",
    model: process.env.DEEPGRAM_TTS_MODEL ?? DEFAULT_MODEL,
    encoding: process.env.DEEPGRAM_TTS_ENCODING ?? DEFAULT_ENCODING,
    sampleRate: Number(process.env.DEEPGRAM_TTS_SAMPLE_RATE ?? DEFAULT_SAMPLE_RATE),
    apiKey: config.voice.deepgramApiKey,
    timeoutMs: Number(process.env.DEEPGRAM_TTS_TIMEOUT_MS ?? "15000"),
  };
}

// ---------------------------------------------------------------------------
// Minimal WS interface for testability — `ws` package satisfies this.
// ---------------------------------------------------------------------------

export interface TtsWebSocket {
  on(event: "open" | "message" | "error" | "close", listener: (...args: unknown[]) => void): void;
  send(data: string | Buffer): void;
  close(): void;
  readyState?: number;
}

export type TtsWsFactory = (url: string, headers: Record<string, string>) => TtsWebSocket;

// Default factory uses the `ws` package (already a dep for the broadcast WS).
// ESM-safe — `apps/server` has "type": "module", so require() is undefined.
// Codex Phase 2.4 P1: this previously used require("ws") which throws at
// runtime in the built .mjs entrypoint.
const defaultWsFactory: TtsWsFactory = (url, headers) => {
  return new WebSocket(url, { headers }) as unknown as TtsWebSocket;
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StreamTtsOptions {
  sessionId: string;
  interventionId: string;
  text: string;
  /** Override config (mainly for tests). */
  config?: Partial<StreamingTtsConfig>;
  /** Inject a WS factory (required in tests). */
  wsFactory?: TtsWsFactory;
}

export interface StreamTtsResult {
  /** ms from request → first chunk forwarded. -1 if no chunks arrived. */
  firstChunkMs: number;
  /** ms from request → last chunk forwarded. */
  totalMs: number;
  /** Number of audio chunks forwarded. */
  chunkCount: number;
  /** Total PCM bytes streamed. */
  bytesStreamed: number;
  /** Why we stopped: "complete" | "timeout" | "error" | "disabled" | "cancelled". */
  outcome: "complete" | "timeout" | "error" | "disabled" | "cancelled";
}

// Per-session registry of in-flight TTS streams. Lets the barge-in path
// cancel an audible reply when the shopper starts talking (Phase 2.7).
interface ActiveTtsStream {
  ws: TtsWebSocket;
  cancel: () => void;
}
const activeStreams = new Map<string, ActiveTtsStream>();

/**
 * Cancel an in-flight streaming TTS for a session. Used by barge-in (Phase
 * 2.7) when the shopper starts speaking while AVA is still talking.
 * Returns `true` if a stream was cancelled, `false` if none was active.
 */
export function cancelTtsStream(sessionId: string): boolean {
  const active = activeStreams.get(sessionId);
  if (!active) return false;
  try { active.cancel(); } catch { /* swallow */ }
  return true;
}

/** True iff a streaming TTS is currently running for the session. */
export function isTtsStreamActive(sessionId: string): boolean {
  return activeStreams.has(sessionId);
}

/** Test helper. */
export function __resetTtsStreams(): void {
  for (const [, s] of activeStreams) {
    try { s.cancel(); } catch { /* swallow */ }
  }
  activeStreams.clear();
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Stream a TTS utterance from Deepgram to the widget. Returns latency stats.
 * Never throws — every failure path returns an outcome string in the result.
 *
 * Feature-flag off → returns immediately with `outcome: "disabled"` and 0
 * counters. Callers should treat that as "use the legacy voice_script
 * fallback" rather than as an error.
 */
export async function streamTtsToSession(opts: StreamTtsOptions): Promise<StreamTtsResult> {
  const cfg: StreamingTtsConfig = { ...getStreamingTtsConfig(), ...opts.config };

  if (!cfg.enabled) {
    return { firstChunkMs: -1, totalMs: 0, chunkCount: 0, bytesStreamed: 0, outcome: "disabled" };
  }
  if (!cfg.apiKey) {
    log.warn("[StreamingTTS] DEEPGRAM_API_KEY missing — falling back");
    return { firstChunkMs: -1, totalMs: 0, chunkCount: 0, bytesStreamed: 0, outcome: "error" };
  }
  if (!opts.text.trim()) {
    return { firstChunkMs: -1, totalMs: 0, chunkCount: 0, bytesStreamed: 0, outcome: "error" };
  }

  const startedAt = Date.now();
  const factory = opts.wsFactory ?? defaultWsFactory;
  const url = new URL(DEEPGRAM_TTS_WS_URL);
  url.searchParams.set("model", cfg.model);
  url.searchParams.set("encoding", cfg.encoding);
  url.searchParams.set("sample_rate", String(cfg.sampleRate));

  let chunkCount = 0;
  let bytesStreamed = 0;
  let firstChunkMs = -1;

  return new Promise<StreamTtsResult>((resolve) => {
    let resolved = false;
    const finish = (outcome: StreamTtsResult["outcome"]) => {
      if (resolved) return;
      resolved = true;
      activeStreams.delete(opts.sessionId);
      try { ws.close(); } catch { /* already closed */ }
      clearTimeout(timer);
      // Tell the widget the stream is done so it can finalize playback.
      try {
        broadcastToSession("widget", opts.sessionId, {
          type: "voice_chunk_end",
          intervention_id: opts.interventionId,
          total_chunks: chunkCount,
          outcome,
        });
      } catch { /* broadcast failures are non-fatal */ }
      resolve({
        firstChunkMs,
        totalMs: Date.now() - startedAt,
        chunkCount,
        bytesStreamed,
        outcome,
      });
    };

    const timer = setTimeout(() => finish("timeout"), cfg.timeoutMs);
    const ws = factory(url.toString(), { Authorization: `Token ${cfg.apiKey}` });

    // Phase 2.7 — register this stream so barge-in can cancel it.
    // If another stream is already active for this session, cancel it first
    // (most-recent-wins). Rare in practice but possible if a proactive fire
    // races a reactive voice query.
    const prior = activeStreams.get(opts.sessionId);
    if (prior) {
      try { prior.cancel(); } catch { /* swallow */ }
    }
    activeStreams.set(opts.sessionId, {
      ws,
      cancel: () => finish("cancelled"),
    });

    ws.on("open", () => {
      // Deepgram's streaming TTS expects: { type: "Speak", text } then "Flush".
      try {
        ws.send(JSON.stringify({ type: "Speak", text: opts.text }));
        ws.send(JSON.stringify({ type: "Flush" }));
      } catch (err) {
        log.warn({ err }, "[StreamingTTS] send failed");
        finish("error");
      }
    });

    ws.on("message", (raw: unknown) => {
      // Binary frame = audio chunk. Text frame = JSON control message
      // (Metadata / Flushed / Error).
      if (Buffer.isBuffer(raw)) {
        const chunk = raw as Buffer;
        chunkCount++;
        bytesStreamed += chunk.length;
        if (firstChunkMs < 0) firstChunkMs = Date.now() - startedAt;
        try {
          broadcastToSession("widget", opts.sessionId, {
            type: "voice_chunk",
            intervention_id: opts.interventionId,
            sequence: chunkCount,
            // Base64 wraps cleanly in JSON; widget decodes back to bytes.
            chunk: chunk.toString("base64"),
            encoding: cfg.encoding,
            sample_rate: cfg.sampleRate,
          });
        } catch { /* broadcast failures are non-fatal */ }
        return;
      }
      // Control message — Deepgram emits a `Flushed` event when generation
      // completes. We end the stream on that signal.
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg?.type === "Flushed") finish("complete");
        if (msg?.type === "Error") {
          log.warn({ msg }, "[StreamingTTS] Deepgram returned error event");
          finish("error");
        }
      } catch { /* malformed control msg — ignore */ }
    });

    ws.on("error", (err: unknown) => {
      log.warn({ err }, "[StreamingTTS] WS error");
      finish("error");
    });

    ws.on("close", () => {
      // If we received chunks but never got the Flushed event, count it as
      // complete — Deepgram sometimes closes the socket right after flushing.
      if (chunkCount > 0) finish("complete");
      else finish("error");
    });
  });
}

// ---------------------------------------------------------------------------
// Testing helper — exposed only for vitest.
// ---------------------------------------------------------------------------

export const __TEST__ = {
  DEEPGRAM_TTS_WS_URL,
  defaultWsFactory,
};
