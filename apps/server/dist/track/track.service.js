import { EventRepo, InterventionRepo, SessionRepo } from "@ava/db";
import { EventBuffer } from "./event-buffer.js";
import { normalizeEvent, extractUtmFields } from "./event-normalizer.js";
import { getOrCreateSession, updateSessionCart } from "./session-manager.js";
import { evaluateEventBatch } from "../evaluate/evaluate.service.js";
import { handleDecision } from "../intervene/intervene.service.js";
import { makeDecision } from "../evaluate/decision-engine.js";
import { broadcastToChannel } from "../broadcast/broadcast.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "track" });
// Event buffer → flushes to evaluation pipeline
const buffer = new EventBuffer(async (sessionId, eventIds) => {
    log.info(`[Track] Buffer flushed for session ${sessionId} — ${eventIds.length} events`);
    try {
        // Run evaluation
        const result = await evaluateEventBatch(sessionId, eventIds);
        log.info(`[Track] Evaluation result for session ${sessionId}:`, result ? `tier=${result.tier} score=${result.compositeScore}` : "null");
        if (!result)
            return;
        // Broadcast evaluation to dashboard (reshape to match dashboard EvaluationData)
        broadcastToChannel("dashboard", {
            type: "evaluation",
            sessionId,
            data: {
                evaluation_id: result.evaluationId,
                session_id: sessionId,
                timestamp: Date.now(),
                narrative: result.narrative,
                frictions_found: result.frictionIds.map((fid) => ({
                    friction_id: fid,
                    category: "detected",
                    confidence: 0.8,
                    evidence: [],
                    source: result.engine === "llm" ? "llm" : "rule",
                })),
                mswim: {
                    signals: result.signals,
                    weights_used: {},
                    composite_score: result.compositeScore,
                    tier: result.tier,
                    gate_override: result.gateOverride ?? null,
                    decision: result.decision,
                    reasoning: result.reasoning,
                },
                intervention_type: result.interventionType,
                decision_reasoning: result.reasoning,
                engine: result.engine,
                abandonment_score: result.abandonmentScore,
            },
        });
        // Make final decision
        const decision = makeDecision(result);
        if (decision.decision === "fire" && decision.type) {
            // Fire intervention
            const intervention = await handleDecision(sessionId, decision, result);
            if (intervention) {
                // Broadcast intervention to widget — flatten to match InterventionPayload interface
                const widgetPayload = {
                    ...intervention.payload,
                    intervention_id: intervention.interventionId,
                    type: intervention.type,
                    action_code: intervention.actionCode,
                    friction_id: intervention.frictionId,
                };
                broadcastToChannel("widget", {
                    type: "intervention",
                    sessionId,
                    payload: widgetPayload,
                });
                // Broadcast to dashboard (reshape to match dashboard InterventionData)
                const payload = intervention.payload;
                broadcastToChannel("dashboard", {
                    type: "intervention",
                    sessionId,
                    data: {
                        intervention_id: intervention.interventionId,
                        session_id: sessionId,
                        type: intervention.type,
                        action_code: intervention.actionCode,
                        friction_id: intervention.frictionId,
                        timestamp: Date.now(),
                        message: payload?.message,
                        cta_label: payload?.cta_label,
                        cta_action: payload?.cta_action,
                        mswim_score: intervention.mswimScore,
                        mswim_tier: intervention.tier,
                        status: "sent",
                        // Voice fields — enable dashboard voice analytics card
                        voice_enabled: payload?.voice_enabled,
                    },
                });
            }
        }
    }
    catch (error) {
        log.error(`[Track] ❌ Evaluation pipeline error for session ${sessionId}:`, error);
        if (error instanceof Error) {
            log.error(`[Track] Error name: ${error.name}, message: ${error.message}`);
            log.error(`[Track] Stack:`, error.stack);
        }
    }
});
/**
 * Process an incoming track event from the widget.
 */
export async function processTrackEvent(visitorKey, sessionData, rawEvent) {
    // 1. Get or create session
    const sessionId = await getOrCreateSession(visitorKey, sessionData);
    // 2. Normalize the event
    const normalized = normalizeEvent(rawEvent);
    // 3. Persist the event (include analytics fields + denormalized siteUrl)
    const event = await EventRepo.createEvent({
        sessionId,
        ...normalized,
        siteUrl: sessionData.siteUrl,
    });
    // 4. Analytics side-effects on page_view / page_unload (non-blocking)
    if (normalized.eventType === "page_view") {
        // Increment page view counter
        SessionRepo.incrementPageViews(sessionId).catch(() => { });
        // Set entry page + UTM fields on the first page_view (only if entryPage not yet set)
        const utmFields = extractUtmFields(rawEvent);
        SessionRepo.getSession(sessionId).then((session) => {
            if (session && !session.entryPage) {
                SessionRepo.setEntryPage(sessionId, normalized.pageUrl, utmFields).catch(() => { });
            }
        }).catch(() => { });
    }
    if (normalized.eventType === "page_unload") {
        // Update exit page and accumulate time-on-site
        SessionRepo.setExitPage(sessionId, normalized.pageUrl).catch(() => { });
        if (normalized.timeOnPageMs && normalized.timeOnPageMs > 0) {
            SessionRepo.accumulateTimeOnSite(sessionId, normalized.timeOnPageMs).catch(() => { });
        }
    }
    // 5. Update cart if cart event
    if (normalized.category === "cart") {
        try {
            const signals = JSON.parse(normalized.rawSignals);
            if (signals.cartValue !== undefined) {
                await updateSessionCart(sessionId, Number(signals.cartValue), Number(signals.cartItemCount ?? 0));
            }
        }
        catch {
            // ignore parse errors
        }
    }
    // 5. Broadcast raw event to dashboard
    broadcastToChannel("dashboard", {
        type: "track_event",
        sessionId,
        data: {
            id: event.id,
            ...normalized,
            timestamp: event.timestamp,
        },
    });
    // 6. Implicit outcome attribution: purchase_complete / order_complete
    //    Auto-attribute "converted" to the most recent intervention if fired ≤30 min ago.
    if (normalized.eventType === "purchase_complete" ||
        normalized.eventType === "order_complete") {
        InterventionRepo.getRecentInterventionsBySession(sessionId, 1)
            .then(([recent]) => {
            if (!recent)
                return;
            // Only attribute if within 30-minute window and not already resolved
            const ageMs = Date.now() - new Date(recent.timestamp).getTime();
            if (ageMs <= 30 * 60 * 1000 && recent.status === "delivered") {
                recordInterventionOutcome(recent.id, "converted", "purchase_complete").catch(() => { });
            }
        })
            .catch(() => { });
    }
    // 7. Buffer for evaluation
    buffer.add(sessionId, event.id);
    return { sessionId, eventId: event.id };
}
//# sourceMappingURL=track.service.js.map