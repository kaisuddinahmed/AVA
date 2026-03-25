import type { WebSocket } from "ws";
import { processTrackEvent } from "./track.service.js";
import { recordInterventionOutcome } from "../intervene/intervene.service.js";
import { handleVoiceQuery } from "../voice/voice-responder.service.js";
import {
  WsWidgetMessageSchema,
  WsVoiceQuerySchema,
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
      // Maybe it's a voice query (Phase 2 ASR)
      const voiceQueryResult = validatePayload(WsVoiceQuerySchema, raw);
      if (voiceQueryResult.success) {
        const { session_id, transcript, page_context } = voiceQueryResult.data;
        log.info(`[Track] Voice query from session ${session_id}: "${transcript.slice(0, 60)}"`);

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
