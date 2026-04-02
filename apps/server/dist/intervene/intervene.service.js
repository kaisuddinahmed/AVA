import { EventRepo, InterventionRepo, SessionRepo, SiteConfigRepo } from "@ava/db";
import { getAction } from "./action-registry.js";
import { buildPayload } from "./payload-builder.js";
import { captureTrainingDatapoint } from "../training/training-collector.service.js";
import { broadcastToChannel } from "../broadcast/broadcast.service.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "intervene" });
/**
 * Handle a fire decision: build payload, persist intervention, update session.
 */
export async function handleDecision(sessionId, decision, evaluation) {
    if (decision.decision !== "fire" || !decision.type)
        return null;
    const [{ mode: runtimeMode, session }, recentEvents] = await Promise.all([
        resolveRuntimeMode(sessionId),
        EventRepo.getEventsBySession(sessionId, { limit: 20 }),
    ]);
    const guardResult = applyRevenueFirstGuard(decision, runtimeMode);
    const effectiveDecision = guardResult.decision;
    // Determine voice budget: disabled when voice is globally off, session muted, or max reached
    const voiceDisabled = !config.voice.enabled ||
        !session ||
        session.voiceMuted ||
        session.totalVoiceInterventionsFired >= config.voice.maxPerSession;
    if (!config.voice.enabled) {
        // Silent — voice simply not configured for this deployment
    }
    else if (voiceDisabled && session) {
        log.info(`[Intervene] Voice budget exhausted for session ${sessionId} ` +
            `(fired=${session.totalVoiceInterventionsFired}, muted=${session.voiceMuted})`);
    }
    // Map DB events to the shape product-intelligence expects
    const sessionEvents = recentEvents.map((e) => {
        let signals = {};
        try {
            signals = JSON.parse(e.rawSignals);
        }
        catch {
            // keep empty
        }
        return { eventType: e.eventType, frictionId: e.frictionId, signals };
    });
    // Build session context for tiered template selection
    const sessionCtx = session
        ? {
            isRepeatVisitor: session.isRepeatVisitor,
            totalDismissals: session.totalDismissals,
            totalConversions: session.totalConversions,
            totalInterventionsFired: session.totalInterventionsFired,
            cartValue: session.cartValue,
        }
        : undefined;
    // Build the intervention payload (async: may derive product suggestions)
    const payload = await buildPayload(effectiveDecision.type ?? "passive", effectiveDecision.actionCode, effectiveDecision.frictionId, evaluation, sessionEvents, voiceDisabled, sessionCtx);
    // Persist intervention (capture cart value for revenue attribution)
    const intervention = await InterventionRepo.createIntervention({
        sessionId,
        evaluationId: effectiveDecision.evaluationId,
        type: effectiveDecision.type ?? "passive",
        actionCode: effectiveDecision.actionCode,
        frictionId: effectiveDecision.frictionId,
        payload: JSON.stringify(payload),
        mswimScoreAtFire: evaluation.compositeScore,
        tierAtFire: evaluation.tier,
        cartValueAtFire: session?.cartValue ?? 0,
    });
    // Update session counters
    await SessionRepo.incrementInterventionsFired(sessionId);
    // Increment voice counter fire-and-forget when voice is actually enabled
    if (payload.voice_enabled === true) {
        SessionRepo.incrementVoiceInterventionsFired(sessionId).catch(() => { });
    }
    return {
        interventionId: intervention.id,
        sessionId,
        type: effectiveDecision.type ?? "passive",
        actionCode: effectiveDecision.actionCode,
        frictionId: effectiveDecision.frictionId,
        payload,
        mswimScore: evaluation.compositeScore,
        tier: evaluation.tier,
        runtimeMode,
        guardApplied: guardResult.applied,
        guardReason: guardResult.reason,
        originalType: guardResult.applied ? decision.type : undefined,
        originalActionCode: guardResult.applied ? decision.actionCode : undefined,
    };
}
/**
 * Record the outcome of an intervention (delivered, dismissed, converted, ignored).
 *
 * Passive interventions are silent UI tweaks with no user interaction.
 * The widget reports them as "ignored" immediately after execution, but
 * semantically they were "delivered" — remap server-side to keep training
 * labels accurate without touching the widget code.
 */
export async function recordInterventionOutcome(interventionId, status, conversionAction) {
    // voice_muted: user tapped the mute button during a voice intervention.
    // Mark session as muted (fire-and-forget), then record as "dismissed" for
    // training-data consistency (the user actively rejected the interaction).
    if (status === "voice_muted") {
        const existing = await InterventionRepo.getIntervention(interventionId);
        if (existing) {
            SessionRepo.setVoiceMuted(existing.sessionId).catch(() => { });
        }
        status = "dismissed";
    }
    // Remap passive "ignored" → "delivered" for accurate training labels
    let effectiveStatus = status;
    if (status === "ignored") {
        const existing = await InterventionRepo.getIntervention(interventionId);
        if (existing?.type === "passive") {
            effectiveStatus = "delivered";
        }
    }
    const intervention = await InterventionRepo.recordOutcome(interventionId, {
        status: effectiveStatus,
        conversionAction,
    });
    // Update session counters
    if (effectiveStatus === "dismissed") {
        await SessionRepo.incrementDismissals(intervention.sessionId);
    }
    else if (effectiveStatus === "converted") {
        await SessionRepo.incrementConversions(intervention.sessionId);
        // Revenue attribution: compute cart lift and add to session.attributedRevenue
        const cartAtFire = intervention.cartValueAtFire ?? null;
        if (cartAtFire != null) {
            const session = await SessionRepo.getSession(intervention.sessionId);
            const cartNow = session?.cartValue ?? cartAtFire;
            const lift = Math.max(0, cartNow - cartAtFire);
            if (lift > 0) {
                SessionRepo.addAttributedRevenue(intervention.sessionId, lift).catch(() => { });
            }
        }
    }
    // Capture training datapoint on terminal outcomes (non-blocking)
    captureTrainingDatapoint(interventionId, effectiveStatus).catch((error) => {
        log.error("[Intervene] Training datapoint capture failed:", error);
    });
    // Broadcast updated intervention status to dashboard so feed reflects outcomes in real time.
    let payload = {};
    try {
        payload = JSON.parse(intervention.payload);
    }
    catch {
        // keep empty payload on parse error
    }
    broadcastToChannel("dashboard", {
        type: "intervention",
        sessionId: intervention.sessionId,
        data: {
            intervention_id: intervention.id,
            session_id: intervention.sessionId,
            type: intervention.type,
            action_code: intervention.actionCode,
            friction_id: intervention.frictionId,
            timestamp: Date.now(),
            message: payload?.message,
            cta_label: payload?.cta_label,
            cta_action: payload?.cta_action,
            mswim_score: intervention.mswimScoreAtFire,
            mswim_tier: intervention.tierAtFire,
            status: effectiveStatus,
            voice_enabled: payload?.voice_enabled,
        },
    });
    return intervention;
}
async function resolveRuntimeMode(sessionId) {
    const session = await SessionRepo.getSession(sessionId);
    if (!session)
        return { mode: "limited_active", session: null };
    const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(session.siteUrl);
    if (!siteConfig)
        return { mode: "limited_active", session };
    const mode = siteConfig.integrationStatus === "active" ? "active" : "limited_active";
    return { mode, session };
}
function applyRevenueFirstGuard(decision, runtimeMode) {
    if (runtimeMode !== "limited_active") {
        return { decision, applied: false };
    }
    if (decision.decision !== "fire" || !decision.type) {
        return { decision, applied: false };
    }
    if (decision.type === "passive" || decision.type === "nudge") {
        const safeActionCode = enforceLowRiskAction(decision.type, decision.actionCode);
        if (safeActionCode === decision.actionCode) {
            return { decision, applied: false };
        }
        return {
            decision: { ...decision, actionCode: safeActionCode },
            applied: true,
            reason: "limited_active_low_risk_action_adjustment",
        };
    }
    return {
        decision: {
            ...decision,
            type: "nudge",
            actionCode: "nudge_suggestion",
        },
        applied: true,
        reason: `limited_active_downgrade_${decision.type}_to_nudge`,
    };
}
function enforceLowRiskAction(type, actionCode) {
    const action = getAction(actionCode);
    if (action && action.tier === type) {
        return actionCode;
    }
    return type === "passive" ? "passive_info_adjust" : "nudge_suggestion";
}
//# sourceMappingURL=intervene.service.js.map