import { EventRepo, EvaluationRepo, InterventionRepo, SessionRepo } from "@ava/db";
import { config } from "../config.js";
/**
 * Build the full context needed for LLM evaluation.
 */
export async function buildContext(sessionId, newEventIds) {
    const session = await SessionRepo.getSession(sessionId);
    if (!session)
        return null;
    // Get all events for history context
    const allEvents = await EventRepo.getEventsBySession(sessionId, {
        limit: config.evaluation.maxContextEvents,
    });
    // Separate new events from history
    const newEventIdSet = new Set(newEventIds);
    const eventHistory = allEvents
        .filter((e) => !newEventIdSet.has(e.id))
        .map(eventToContext);
    const newEvents = allEvents
        .filter((e) => newEventIdSet.has(e.id))
        .map(eventToContext);
    // Previous evaluations (last 5)
    const evaluations = await EvaluationRepo.getEvaluationsBySession(sessionId);
    const previousEvaluations = evaluations.slice(0, 5).map((e) => ({
        timestamp: e.timestamp,
        narrative: e.narrative,
        tier: e.tier,
        compositeScore: e.compositeScore,
        signals: {
            intent: e.intentScore,
            friction: e.frictionScore,
            clarity: e.clarityScore,
            receptivity: e.receptivityScore,
            value: e.valueScore,
        },
        decision: e.decision,
    }));
    // Previous interventions
    const interventions = await InterventionRepo.getInterventionsBySession(sessionId);
    const previousInterventions = interventions.slice(0, 10).map((i) => ({
        timestamp: i.timestamp,
        type: i.type,
        actionCode: i.actionCode,
        frictionId: i.frictionId,
        status: i.status,
    }));
    // Session metadata
    const sessionMeta = {
        sessionId: session.id,
        siteUrl: session.siteUrl,
        deviceType: session.deviceType,
        referrerType: session.referrerType,
        isLoggedIn: session.isLoggedIn,
        isRepeatVisitor: session.isRepeatVisitor,
        cartValue: session.cartValue,
        cartItemCount: session.cartItemCount,
        status: session.status,
        sessionAgeSec: Math.floor((Date.now() - session.startedAt.getTime()) / 1000),
        totalInterventionsFired: session.totalInterventionsFired,
        totalDismissals: session.totalDismissals,
        totalConversions: session.totalConversions,
        totalEvents: allEvents.length,
    };
    return {
        sessionMeta,
        eventHistory,
        newEvents,
        previousEvaluations,
        previousInterventions,
    };
}
function eventToContext(event) {
    let signals = {};
    try {
        signals = JSON.parse(event.rawSignals);
    }
    catch {
        // keep empty
    }
    return {
        id: event.id,
        time: event.timestamp.toISOString(),
        category: event.category,
        type: event.eventType,
        frictionId: event.frictionId,
        pageType: event.pageType,
        url: event.pageUrl,
        signals,
    };
}
//# sourceMappingURL=context-builder.js.map