import type { WebSocket } from "ws";
import { processTrackEvent } from "./track.service.js";
import { recordInterventionOutcome } from "../intervene/intervene.service.js";
import { handleVoiceQuery } from "../voice/voice-responder.service.js";
import { handleAgentWsMessage } from "../api/agent.api.js";
import {
  startSttStream,
  sendSttAudio,
  endSttStream,
} from "../voice/streaming-stt.service.js";
import { cancelTtsStream, isTtsStreamActive } from "../voice/streaming-tts.service.js";
import {
  WsWidgetMessageSchema,
  WsVoiceQuerySchema,
  WsAgentQuerySchema,
  WsVoiceStreamStartSchema,
  WsAudioChunkSchema,
  WsVoiceStreamEndSchema,
  WsTtsCancelSchema,
  InterventionOutcomeSchema,
  InterventionFeedbackSchema,
  validatePayload,
} from "../validation/schemas.js";
import { InterventionFeedbackRepo, TrainingDatapointRepo } from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "track" });

/**
 * Handle incoming WebSocket messages from the widget.
 * All messages are validated with Zod before processing.
 */
export function handleTrackMessage(ws: WebSocket, data: unknown) {
  try {
    const raw = typeof data === "string" ? JSON.parse(data) : data;

    // Validate against widget message schema (track | ping)
    const result = validatePayload(WsWidgetMessageSchema, raw);

    if (!result.success) {
      // Maybe it's an agent query (Story 12 shopping agent)
      const agentQueryResult = validatePayload(WsAgentQuerySchema, raw);
      if (agentQueryResult.success) {
        handleAgentWsMessage(ws, agentQueryResult.data as Record<string, unknown>)
          .catch((error) => {
            log.error("[Track] Agent query error:", error);
            ws.send(
              JSON.stringify({
                type: "agent_error",
                error: "Failed to process agent query",
              }),
            );
          });
        return;
      }

      // Phase 2.7 — Streaming STT lifecycle + barge-in. Match these BEFORE
      // the legacy voice_query path so streaming clients don't fall through.
      const sttStartResult = validatePayload(WsVoiceStreamStartSchema, raw);
      if (sttStartResult.success) {
        const { session_id, page_context } = sttStartResult.data;
        // Barge-in invariant: if TTS is playing, cancel it before opening STT.
        // Even when streaming TTS is off, this is a no-op (returns false).
        const cancelled = cancelTtsStream(session_id);
        if (cancelled) {
          log.info({ session_id }, "[Track] barge-in cancelled in-flight TTS");
        }
        const r = startSttStream({
          sessionId: session_id,
          onFinal: (transcript) => {
            // Route the final transcript through the same handler that the
            // REST STT proxy + legacy voice_query path use. Privacy: never
            // log transcript content — handleVoiceQuery handles redaction.
            void handleVoiceQuery(ws, session_id, transcript, page_context);
          },
        });
        ws.send(JSON.stringify({
          type: "voice_stream_ack",
          session_id,
          status: r.outcome,
          barge_in_cancelled: cancelled,
        }));
        return;
      }

      const audioChunkResult = validatePayload(WsAudioChunkSchema, raw);
      if (audioChunkResult.success) {
        const { session_id, chunk } = audioChunkResult.data;
        let buf: Buffer;
        try { buf = Buffer.from(chunk, "base64"); }
        catch {
          ws.send(JSON.stringify({ type: "audio_chunk_error", session_id, error: "decode_failed" }));
          return;
        }
        const accepted = sendSttAudio(session_id, buf);
        if (!accepted) {
          ws.send(JSON.stringify({ type: "audio_chunk_error", session_id, error: "no_active_stream" }));
        }
        return;
      }

      const streamEndResult = validatePayload(WsVoiceStreamEndSchema, raw);
      if (streamEndResult.success) {
        const { session_id } = streamEndResult.data;
        void endSttStream(session_id).then((stats) => {
          log.info(
            {
              session_id,
              outcome: stats.outcome,
              partials: stats.partials,
              finals: stats.finals,
              bytesForwarded: stats.bytesForwarded,
              durationMs: stats.durationMs,
            },
            "[Track] voice_stream_end stats",
          );
          ws.send(JSON.stringify({
            type: "voice_stream_closed",
            session_id,
            outcome: stats.outcome,
          }));
        });
        return;
      }

      const ttsCancelResult = validatePayload(WsTtsCancelSchema, raw);
      if (ttsCancelResult.success) {
        const { session_id } = ttsCancelResult.data;
        const cancelled = cancelTtsStream(session_id);
        ws.send(JSON.stringify({ type: "tts_cancel_ack", session_id, cancelled }));
        return;
      }

      // Maybe it's a voice query (Phase 2 ASR)
      const voiceQueryResult = validatePayload(WsVoiceQuerySchema, raw);
      if (voiceQueryResult.success) {
        const { session_id, transcript, page_context } = voiceQueryResult.data;
        // Privacy: log the length only. CLAUDE.md hard rule + Codex Phase
        // 2.0 gate criterion: never log raw transcript fields.
        log.info(
          { session_id, transcript: `(${transcript.length} chars)` },
          "[Track] voice_query received",
        );

        handleVoiceQuery(ws, session_id, transcript, page_context)
          .catch((error) => {
            log.error("[Track] Voice query error:", error);
            ws.send(
              JSON.stringify({
                type: "voice_query_error",
                error: "Failed to process voice query",
              }),
            );
          });
        return;
      }

      // Maybe it's an intervention outcome
      const outcomeResult = validatePayload(InterventionOutcomeSchema, raw);
      if (outcomeResult.success) {
        const { intervention_id, status, conversion_action } =
          outcomeResult.data;

        recordInterventionOutcome(intervention_id, status, conversion_action)
          .then(() => {
            ws.send(
              JSON.stringify({
                type: "outcome_ack",
                intervention_id,
                status,
              }),
            );
          })
          .catch((error) => {
            log.error("[Track] Outcome recording error:", error);
            ws.send(
              JSON.stringify({
                type: "outcome_error",
                intervention_id,
                error: "Failed to record outcome",
              }),
            );
          });
        return;
      }

      // Maybe it's intervention feedback (thumbs up/down)
      const feedbackResult = validatePayload(InterventionFeedbackSchema, raw);
      if (feedbackResult.success) {
        const { intervention_id, session_id, feedback } = feedbackResult.data;
        // Persist feedback + enrich training datapoint (fire-and-forget)
        InterventionFeedbackRepo.createFeedback({
          interventionId: intervention_id,
          sessionId: session_id,
          feedback,
        })
          .then(() => {
            // Also enrich the training datapoint if it exists
            TrainingDatapointRepo.updateUserFeedback(intervention_id, feedback).catch(() => {});
          })
          .catch((err) => log.error("[Track] Feedback persist error:", err));
        ws.send(JSON.stringify({ type: "feedback_ack", intervention_id }));
        return;
      }

      log.warn("[Track] Validation failed:", result.error);
      ws.send(JSON.stringify({ type: "validation_error", error: result.error }));
      return;
    }

    const message = result.data;

    switch (message.type) {
      case "track": {
        const visitorKey = String(
          message.visitorKey ?? message.sessionKey ?? "anonymous",
        );
        const sessionData = {
          siteUrl: String(message.siteUrl ?? ""),
          deviceType: String(message.deviceType ?? "desktop"),
          referrerType: String(message.referrerType ?? "direct"),
          visitorId: message.visitorId ? String(message.visitorId) : undefined,
          isLoggedIn: Boolean(message.isLoggedIn),
          isRepeatVisitor: Boolean(message.isRepeatVisitor),
        };
        const event = message.event as Record<string, unknown>;

        processTrackEvent(visitorKey, sessionData, event)
          .then((trackResult) => {
            ws.send(JSON.stringify({ type: "track_ack", ...trackResult }));
          })
          .catch((error) => {
            log.error("[Track] Error processing event:", error);
            ws.send(
              JSON.stringify({ type: "track_error", error: "Processing failed" }),
            );
          });
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  } catch (error) {
    log.error("[Track] Message handling error:", error);
    ws.send(JSON.stringify({ error: "Internal error" }));
  }
}
