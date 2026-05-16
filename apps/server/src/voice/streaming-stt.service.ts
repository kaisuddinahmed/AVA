// ============================================================================
// Streaming STT — Phase 2.5.
//
// Mirrors streaming-tts.service.ts for the inbound direction:
//
//   Widget mic → audio chunks → server WS handler → THIS module
//     opens wss://api.deepgram.com/v1/listen?model=nova-2&...
//     forwards binary PCM frames as they arrive
//     receives JSON transcripts back
//         ↓
//   broadcastToSession("widget", sessionId, {
//     type: "voice_partial" | "voice_final",
//     transcript: "...",
//   })
//
// On `voice_final` the caller (track.handlers via wireSttStream) hands the
// finalized transcript to the existing handleVoiceQuery() path — same code
// the REST STT proxy already feeds.
//
// Per-session state lives in a module-level Map: startSttStream() registers
// a session, sendSttAudio() routes a chunk, endSttStream() closes it. The
// barge-in path (Phase 2.7) calls cancelSttStream() to interrupt.
//
// CLAUDE.md hard rule observed: NO raw transcript is ever logged. Only
// length + outcome telemetry leaves this module.
//
// Feature-flagged: VOICE_STT_STREAMING_ENABLED=true to turn on. Disabled by
// default — existing REST POST /api/voice/sst remains production behavior
// until the widget mic-streaming client ships (Phase 2.7).
// ============================================================================

import { WebSocket } from "ws";
import { logger } from "../logger.js";
import { broadcastToSession } from "../broadcast/broadcast.service.js";
import { config } from "../config.js";

const log = logger.child({ service: "streaming-stt" });

const DEEPGRAM_STT_WS_URL = "wss://api.deepgram.com/v1/listen";
const DEFAULT_MODEL = "nova-2";
const DEFAULT_ENCODING = "linear16";
const DEFAULT_SAMPLE_RATE = 16_000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface StreamingSttConfig {
  enabled: boolean;
  model: string;
  encoding: string;
  sampleRate: number;
  apiKey: string;
  /** Idle window before we auto-close a streaming session. */
  idleTimeoutMs: number;
}

export function getStreamingSttConfig(): StreamingSttConfig {
  return {
    enabled: process.env.VOICE_STT_STREAMING_ENABLED === "true",
    model: process.env.DEEPGRAM_STT_MODEL ?? DEFAULT_MODEL,
    encoding: process.env.DEEPGRAM_STT_ENCODING ?? DEFAULT_ENCODING,
    sampleRate: Number(process.env.DEEPGRAM_STT_SAMPLE_RATE ?? DEFAULT_SAMPLE_RATE),
    apiKey: config.voice.deepgramApiKey,
    idleTimeoutMs: Number(process.env.DEEPGRAM_STT_IDLE_TIMEOUT_MS ?? "30000"),
  };
}

// ---------------------------------------------------------------------------
// Injectable WebSocket — for testability.
// ---------------------------------------------------------------------------

export interface SttWebSocket {
  on(event: "open" | "message" | "error" | "close", listener: (...args: unknown[]) => void): void;
  send(data: string | Buffer): void;
  close(): void;
}

export type SttWsFactory = (url: string, headers: Record<string, string>) => SttWebSocket;

const defaultWsFactory: SttWsFactory = (url, headers) => {
  return new WebSocket(url, { headers }) as unknown as SttWebSocket;
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StartSttOptions {
  sessionId: string;
  /** Called with the final transcript text — caller routes it to handleVoiceQuery. */
  onFinal?: (transcript: string) => void;
  config?: Partial<StreamingSttConfig>;
  wsFactory?: SttWsFactory;
}

interface ActiveSttSession {
  sessionId: string;
  ws: SttWebSocket;
  startedAt: number;
  bytesForwarded: number;
  partials: number;
  finals: number;
  closed: boolean;
  onFinal?: (transcript: string) => void;
  idleTimer: ReturnType<typeof setTimeout> | null;
  cfg: StreamingSttConfig;
  // Codex Phase 2.5 P1#2: `ws.send()` throws if invoked before the WS
  // handshake completes. Audio chunks that arrive in that window are
  // queued and flushed on the `open` event.
  isOpen: boolean;
  preOpenQueue: Buffer[];
  preOpenBytes: number;
  // Codex Phase 2.5 P1#1: graceful close — after sending CloseStream we
  // wait for Deepgram's final/metadata event before tearing down so the
  // last transcript isn't dropped. Resolvers receive the actual teardown
  // outcome so endSttStream() can tell upstream-close from grace-timeout.
  closeWaiters: Array<(outcome: SttStats["outcome"]) => void>;
}

// ---------------------------------------------------------------------------
// Per-session registry
// ---------------------------------------------------------------------------

const sessions = new Map<string, ActiveSttSession>();

export function isSttStreamActive(sessionId: string): boolean {
  return sessions.has(sessionId);
}

export interface SttStats {
  bytesForwarded: number;
  partials: number;
  finals: number;
  durationMs: number;
  outcome: "complete" | "cancelled" | "timeout" | "error" | "disabled";
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Open a streaming STT session. Idempotent: if a session already exists for
 * this sessionId we return it instead of opening a second WS.
 *
 * Disabled flag → returns null. Callers should fall back to the REST proxy.
 */
export function startSttStream(opts: StartSttOptions): { active: boolean; outcome: "started" | "exists" | "disabled" | "error" } {
  const cfg: StreamingSttConfig = { ...getStreamingSttConfig(), ...opts.config };

  if (!cfg.enabled) {
    return { active: false, outcome: "disabled" };
  }
  if (!cfg.apiKey) {
    log.warn({ sessionId: opts.sessionId }, "[StreamingSTT] DEEPGRAM_API_KEY missing");
    return { active: false, outcome: "error" };
  }
  if (sessions.has(opts.sessionId)) {
    return { active: true, outcome: "exists" };
  }

  const factory = opts.wsFactory ?? defaultWsFactory;
  const url = new URL(DEEPGRAM_STT_WS_URL);
  url.searchParams.set("model", cfg.model);
  url.searchParams.set("encoding", cfg.encoding);
  url.searchParams.set("sample_rate", String(cfg.sampleRate));
  url.searchParams.set("interim_results", "true"); // partial transcripts
  url.searchParams.set("smart_format", "true");

  const ws = factory(url.toString(), { Authorization: `Token ${cfg.apiKey}` });

  const session: ActiveSttSession = {
    sessionId: opts.sessionId,
    ws,
    startedAt: Date.now(),
    bytesForwarded: 0,
    partials: 0,
    finals: 0,
    closed: false,
    onFinal: opts.onFinal,
    idleTimer: null,
    cfg,
    isOpen: false,
    preOpenQueue: [],
    preOpenBytes: 0,
    closeWaiters: [],
  };
  sessions.set(opts.sessionId, session);

  ws.on("open", () => {
    session.isOpen = true;
    // Flush any audio chunks that arrived before the handshake completed.
    if (session.preOpenQueue.length > 0) {
      log.info(
        {
          sessionId: opts.sessionId,
          queuedChunks: session.preOpenQueue.length,
          queuedBytes: session.preOpenBytes,
        },
        "[StreamingSTT] flushing pre-open audio queue",
      );
      for (const buf of session.preOpenQueue) {
        try {
          session.ws.send(buf);
          session.bytesForwarded += buf.length;
        } catch (err) {
          log.warn({ err, sessionId: opts.sessionId }, "[StreamingSTT] flush send failed");
        }
      }
      session.preOpenQueue.length = 0;
      session.preOpenBytes = 0;
    }
  });

  const resetIdle = () => {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      log.info({ sessionId: opts.sessionId }, "[StreamingSTT] idle timeout — closing");
      endSttStream(opts.sessionId);
    }, cfg.idleTimeoutMs);
  };
  resetIdle();

  ws.on("message", (raw: unknown) => {
    if (session.closed) return;
    // Deepgram sends JSON transcript events; we never receive binary back.
    let msg: { type?: string; channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean } | null = null;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : (raw as Buffer).toString());
    } catch {
      return;
    }
    if (!msg) return;
    const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!transcript) {
      return;
    }
    const isFinal = msg.is_final === true;
    if (isFinal) {
      session.finals++;
      // Telemetry only — never log transcript content.
      log.info(
        { sessionId: opts.sessionId, finalLen: transcript.length, partials: session.partials },
        "[StreamingSTT] final transcript",
      );
      try {
        broadcastToSession("widget", opts.sessionId, {
          type: "voice_final",
          transcript,
        });
      } catch { /* non-fatal */ }
      if (session.onFinal) {
        try { session.onFinal(transcript); }
        catch (err) { log.warn({ err, sessionId: opts.sessionId }, "[StreamingSTT] onFinal callback threw"); }
      }
    } else {
      session.partials++;
      try {
        broadcastToSession("widget", opts.sessionId, {
          type: "voice_partial",
          transcript,
        });
      } catch { /* non-fatal */ }
    }
    resetIdle();
  });

  ws.on("error", (err: unknown) => {
    log.warn({ err, sessionId: opts.sessionId }, "[StreamingSTT] WS error");
    endSttStreamInternal(opts.sessionId, "error");
  });

  ws.on("close", () => {
    endSttStreamInternal(opts.sessionId, "complete");
  });

  return { active: true, outcome: "started" };
}

/**
 * Forward a binary audio chunk into the upstream Deepgram WS for this
 * session. Returns false when no active session exists or the chunk is
 * empty.
 */
export function sendSttAudio(sessionId: string, chunk: Buffer): boolean {
  const session = sessions.get(sessionId);
  if (!session || session.closed) return false;
  if (!chunk || chunk.length === 0) return false;

  // Codex Phase 2.5 P1#2: queue when the upstream WS hasn't finished the
  // handshake. `ws.send()` throws synchronously in that window with real
  // `ws`, dropping early mic audio. The `open` handler flushes the queue.
  if (!session.isOpen) {
    session.preOpenQueue.push(chunk);
    session.preOpenBytes += chunk.length;
    // Reset idle timer even while queued so the session doesn't time out
    // waiting for the upstream handshake on a slow link.
    bumpIdle(session);
    return true;
  }

  try {
    session.ws.send(chunk);
    session.bytesForwarded += chunk.length;
    bumpIdle(session);
    return true;
  } catch (err) {
    log.warn({ err, sessionId }, "[StreamingSTT] send failed");
    return false;
  }
}

function bumpIdle(session: ActiveSttSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    endSttStream(session.sessionId).catch(() => {});
  }, session.cfg.idleTimeoutMs);
}

/**
 * Send Deepgram's CloseStream control and WAIT for the upstream to flush
 * its final transcript before tearing down the local socket. Returns stats
 * once the final/metadata/close event has been observed (or `finalizeGraceMs`
 * elapses).
 *
 * Codex Phase 2.5 P1#1: previously this sent CloseStream then immediately
 * called `endSttStreamInternal`, racing the final transcript event Deepgram
 * was about to emit. Per Deepgram's Close Stream docs, the server is meant
 * to flush remaining audio and return finalization events before the socket
 * actually closes.
 *
 * Codex Phase 2.5 round 2:
 *   - End-before-open path now WAITS for the upstream `open` (with a small
 *     budget) so queued audio actually flushes. Previously hard-closed as
 *     "error" and lost short utterances (shopper speaks + releases mic
 *     before Deepgram's handshake completes).
 *   - Clean close with no finals reports `complete`, not `timeout`. Only
 *     the grace expiry without an upstream close emits `timeout`.
 */
export async function endSttStream(sessionId: string): Promise<SttStats> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { bytesForwarded: 0, partials: 0, finals: 0, durationMs: 0, outcome: "complete" };
  }
  if (session.closed) {
    return collectStats(session, "complete");
  }

  const graceMs = Number(process.env.DEEPGRAM_STT_FINALIZE_GRACE_MS ?? "1500");

  // Codex P1: if the upstream WS hasn't opened yet, wait for it so any
  // queued audio actually flushes through Deepgram before we send
  // CloseStream. We bound the wait with a fraction of the total grace so
  // an unreachable upstream doesn't pin the caller forever.
  if (!session.isOpen) {
    const openBudgetMs = Math.min(graceMs, 750);
    const opened = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), openBudgetMs);
      session.ws.on("open", () => {
        clearTimeout(t);
        resolve(true);
      });
      // Defence: if the 'open' handler set isOpen synchronously (test
      // doubles do this), short-circuit.
      if (session.isOpen) {
        clearTimeout(t);
        resolve(true);
      }
    });
    if (!opened) {
      log.warn(
        { sessionId, queuedBytes: session.preOpenBytes, openBudgetMs },
        "[StreamingSTT] upstream never opened before endSttStream — discarding queue",
      );
      endSttStreamInternal(sessionId, "error");
      return collectStats(session, "error");
    }
    // Give the open handler one microtask to drain the pre-open queue before
    // we send CloseStream so Deepgram sees the audio first.
    await new Promise<void>((r) => setImmediate(r));
  }

  try { session.ws.send(JSON.stringify({ type: "CloseStream" })); }
  catch { /* upstream may already be torn down */ }

  // Race the upstream `close` event against the grace timer. Whichever
  // teardown path runs first reports its outcome through the waiter, so
  // we can distinguish a clean upstream close (= complete) from a forced
  // grace-expiry teardown (= timeout).
  const teardownOutcome = await new Promise<SttStats["outcome"]>((resolve) => {
    let settled = false;
    const done = (out: SttStats["outcome"]) => {
      if (settled) return;
      settled = true;
      resolve(out);
    };
    session.closeWaiters.push((out) => done(out));
    setTimeout(() => {
      if (!session.closed) {
        log.warn({ sessionId, graceMs }, "[StreamingSTT] CloseStream grace expired — forcing teardown");
        endSttStreamInternal(sessionId, "timeout");
      }
      // If endSttStreamInternal above already resolved the waiter we'll
      // ignore this; if not, fall back to timeout.
      done("timeout");
    }, graceMs);
  });

  return collectStats(session, teardownOutcome);
}

/**
 * Hard-cancel mid-utterance (used by barge-in in Phase 2.7). Closes the WS
 * immediately without flushing.
 */
export function cancelSttStream(sessionId: string): SttStats {
  const session = sessions.get(sessionId);
  if (!session) {
    return { bytesForwarded: 0, partials: 0, finals: 0, durationMs: 0, outcome: "cancelled" };
  }
  const stats = collectStats(session, "cancelled");
  endSttStreamInternal(sessionId, "cancelled");
  return stats;
}

function endSttStreamInternal(sessionId: string, outcome: SttStats["outcome"]): void {
  const session = sessions.get(sessionId);
  if (!session || session.closed) return;
  session.closed = true;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  try { session.ws.close(); } catch { /* already closed */ }
  sessions.delete(sessionId);
  // Resolve any pending endSttStream() awaiters with the actual outcome
  // so the caller can distinguish upstream-close vs grace-timeout vs error.
  for (const waiter of session.closeWaiters) {
    try { waiter(outcome); } catch { /* swallow */ }
  }
  session.closeWaiters.length = 0;
  log.info(
    {
      sessionId,
      bytesForwarded: session.bytesForwarded,
      partials: session.partials,
      finals: session.finals,
      durationMs: Date.now() - session.startedAt,
      outcome,
    },
    "[StreamingSTT] session ended",
  );
}

function collectStats(session: ActiveSttSession, outcome: SttStats["outcome"]): SttStats {
  return {
    bytesForwarded: session.bytesForwarded,
    partials: session.partials,
    finals: session.finals,
    durationMs: Date.now() - session.startedAt,
    outcome,
  };
}

/** Test-only helper — drop all session state between test cases. */
export function __resetSttSessions(): void {
  for (const id of Array.from(sessions.keys())) {
    endSttStreamInternal(id, "cancelled");
  }
}
