import { createHash } from "crypto";
import { EvaluationRepo, InterventionRepo, SessionRepo, SiteConfigRepo } from "@ava/db";
import { buildContext } from "./context-builder.js";
import { evaluateWithLLM } from "./analyst.js";
import { runMSWIM } from "./mswim/mswim.engine.js";
import { ScoreTier } from "@ava/shared";
import { config } from "../config.js";
import { runShadowEvaluation } from "./shadow-evaluator.js";
import { logShadowComparison } from "./shadow-logger.js";
import { runFastEvaluation, shouldEscalateToLLM, inferFrictionFromContext } from "./fast-evaluator.js";
import { resolveExperimentOverrides } from "../experiment/experiment-resolver.js";
import { detectBehaviorPatterns, extractActiveGroups } from "./behavior-pattern-matcher.js";
// ── Tier helpers ──────────────────────────────────────────────────────────────
function mapTierToDefaultAction(tier) {
    switch (tier) {
        case "PASSIVE":
            return "passive_info_adjust";
        case "NUDGE":
            return "nudge_suggestion";
        case "ACTIVE":
            return "active_comparison";
        case "ESCALATE":
            return "escalate_full_assist";
        default:
            return "none";
    }
}
const TIER_LABELS = {
    [ScoreTier.MONITOR]: "MONITOR",
    [ScoreTier.PASSIVE]: "PASSIVE",
    [ScoreTier.NUDGE]: "NUDGE",
    [ScoreTier.ACTIVE]: "ACTIVE",
    [ScoreTier.ESCALATE]: "ESCALATE",
};
const INTERVENTION_TYPE_MAP = {
    [ScoreTier.MONITOR]: null,
    [ScoreTier.PASSIVE]: "passive",
    [ScoreTier.NUDGE]: "nudge",
    [ScoreTier.ACTIVE]: "active",
    [ScoreTier.ESCALATE]: "escalate",
};
/**
 * Run the evaluation pipeline for a batch of events.
 *
 * Engine selection priority:
 *   1. Experiment override (if session is in an active experiment)
 *   2. EVAL_ENGINE env var / config
 *
 * Modes: "llm" | "fast" | "auto"
 */
/** Deterministic control group check — SHA-256(sessionId) % 100 < controlGroupPct */
function isControlGroupSession(sessionId) {
    if (config.controlGroupPct <= 0)
        return false;
    const hash = createHash("sha256").update(sessionId).digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;
    return bucket < config.controlGroupPct;
}
export async function evaluateEventBatch(sessionId, eventIds) {
    // Resolve experiment overrides (non-blocking on failure)
    const session = await SessionRepo.getSession(sessionId);
    const siteUrl = session?.siteUrl;
    // Control group: mark session on first evaluation, then suppress interventions
    if (!session?.isControlSession && isControlGroupSession(sessionId)) {
        SessionRepo.markControlSession(sessionId).catch(() => { });
        // Return a MONITOR result — no intervention will fire
        return null;
    }
    if (session?.isControlSession)
        return null;
    const overrides = await resolveExperimentOverrides(sessionId, siteUrl);
    // Apply experiment engine override or use config default
    const engine = overrides?.evalEngine ?? config.evalEngine;
    // Store overrides for MSWIM config loading (passed via sessionId context)
    if (overrides?.scoringConfigId) {
        _experimentConfigOverrides.set(sessionId, overrides.scoringConfigId);
    }
    // Store model override for LLM calls
    if (overrides?.modelId) {
        _experimentModelOverrides.set(sessionId, overrides.modelId);
    }
    log.info(`[Evaluate] Starting evaluation for session ${sessionId}, engine=${engine}, events=${eventIds.length}`);
    try {
        if (engine === "fast") {
            return await evaluateFast(sessionId, eventIds);
        }
        if (engine === "auto") {
            return await evaluateAuto(sessionId, eventIds);
        }
        // Default: "llm"
        return await evaluateLLM(sessionId, eventIds);
    }
    catch (err) {
        log.error(`[Evaluate] ❌ Engine error (${engine}) for session ${sessionId}:`, err);
        throw err;
    }
    finally {
        // Clean up per-session overrides
        _experimentConfigOverrides.delete(sessionId);
        _experimentModelOverrides.delete(sessionId);
    }
}
/**
 * Per-session experiment config overrides. Set before MSWIM runs,
 * cleaned up after evaluation completes. Thread-safe for single-threaded Node.
 */
export const _experimentConfigOverrides = new Map();
/**
 * Per-session experiment model overrides. Threads modelId from experiment
 * variant to the LLM call for model A/B testing.
 */
export const _experimentModelOverrides = new Map();
/**
 * Get the experiment scoring config override for a session, if any.
 */
export function getExperimentConfigOverride(sessionId) {
    return _experimentConfigOverrides.get(sessionId);
}
// ── Fast engine path ──────────────────────────────────────────────────────────
async function evaluateFast(sessionId, eventIds) {
    const { sessionCtx, frictionIds, detectedPatterns, context } = await buildSessionAndFrictions(sessionId, eventIds);
    if (!sessionCtx)
        return null;
    const fastResult = await runFastEvaluation({
        sessionCtx,
        detectedFrictionIds: frictionIds,
        pageType: sessionCtx.pageType,
        eventCount: sessionCtx.eventCount,
        ...extractAbandonmentSignals(context),
    });
    const { mswimResult, narrative, reasoning, abandonmentScore } = fastResult;
    const tierLabel = TIER_LABELS[mswimResult.tier];
    const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];
    const evaluation = await EvaluationRepo.createEvaluation({
        sessionId,
        eventBatchIds: JSON.stringify(eventIds),
        narrative,
        frictionsFound: JSON.stringify(frictionIds),
        intentScore: mswimResult.signals.intent,
        frictionScore: mswimResult.signals.friction,
        clarityScore: mswimResult.signals.clarity,
        receptivityScore: mswimResult.signals.receptivity,
        valueScore: mswimResult.signals.value,
        compositeScore: mswimResult.composite_score,
        weightsUsed: JSON.stringify(mswimResult.weights_used),
        tier: tierLabel,
        decision: mswimResult.decision,
        gateOverride: mswimResult.gate_override?.toString() ?? undefined,
        interventionType: interventionType ?? undefined,
        reasoning,
        detectedBehaviors: detectedPatterns.length > 0 ? JSON.stringify(detectedPatterns) : undefined,
        abandonmentScore,
    });
    // === SHADOW MODE: Compare fast result against shadow (non-blocking) ===
    if (config.shadow.enabled) {
        runShadowEvaluation({
            sessionCtx,
            detectedFrictionIds: frictionIds,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
        })
            .then((shadow) => logShadowComparison({
            sessionId,
            evaluationId: evaluation.id,
            siteUrl: sessionCtx.siteUrl,
            prodResult: mswimResult,
            shadowResult: shadow.shadowResult,
            syntheticHints: shadow.syntheticHints,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
            cartValue: sessionCtx.cartValue,
        }))
            .catch((err) => log.error("[Shadow] Fast path failed (non-blocking):", err));
    }
    return {
        evaluationId: evaluation.id,
        decision: mswimResult.decision,
        tier: tierLabel,
        compositeScore: mswimResult.composite_score,
        interventionType,
        frictionIds,
        narrative,
        signals: mswimResult.signals,
        reasoning,
        recommendedAction: mapTierToDefaultAction(tierLabel),
        engine: "fast",
        gateOverride: mswimResult.gate_override?.toString() ?? null,
        abandonmentScore,
    };
}
// ── Auto engine path (fast first, LLM fallback) ──────────────────────────────
async function evaluateAuto(sessionId, eventIds) {
    const { sessionCtx, frictionIds, context, detectedPatterns } = await buildSessionAndFrictions(sessionId, eventIds);
    if (!sessionCtx)
        return null;
    // 1. Run fast engine
    const fastResult = await runFastEvaluation({
        sessionCtx,
        detectedFrictionIds: frictionIds,
        pageType: sessionCtx.pageType,
        eventCount: sessionCtx.eventCount,
        ...extractAbandonmentSignals(context),
    });
    // 2. Check if we should escalate to LLM
    if (shouldEscalateToLLM(fastResult) && context) {
        log.info(`[Evaluate:auto] Escalating to LLM for session ${sessionId} (composite=${fastResult.mswimResult.composite_score.toFixed(1)})`);
        return evaluateLLM(sessionId, eventIds);
    }
    // 3. Use fast result
    const { mswimResult, narrative, reasoning, abandonmentScore } = fastResult;
    const tierLabel = TIER_LABELS[mswimResult.tier];
    const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];
    const evaluation = await EvaluationRepo.createEvaluation({
        sessionId,
        eventBatchIds: JSON.stringify(eventIds),
        narrative,
        frictionsFound: JSON.stringify(frictionIds),
        intentScore: mswimResult.signals.intent,
        frictionScore: mswimResult.signals.friction,
        clarityScore: mswimResult.signals.clarity,
        receptivityScore: mswimResult.signals.receptivity,
        valueScore: mswimResult.signals.value,
        compositeScore: mswimResult.composite_score,
        weightsUsed: JSON.stringify(mswimResult.weights_used),
        tier: tierLabel,
        decision: mswimResult.decision,
        gateOverride: mswimResult.gate_override?.toString() ?? undefined,
        interventionType: interventionType ?? undefined,
        reasoning,
        detectedBehaviors: detectedPatterns.length > 0 ? JSON.stringify(detectedPatterns) : undefined,
        abandonmentScore,
    });
    // === SHADOW MODE: Compare auto-fast result against shadow (non-blocking) ===
    if (config.shadow.enabled) {
        runShadowEvaluation({
            sessionCtx,
            detectedFrictionIds: frictionIds,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
        })
            .then((shadow) => logShadowComparison({
            sessionId,
            evaluationId: evaluation.id,
            siteUrl: sessionCtx.siteUrl,
            prodResult: mswimResult,
            shadowResult: shadow.shadowResult,
            syntheticHints: shadow.syntheticHints,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
            cartValue: sessionCtx.cartValue,
        }))
            .catch((err) => log.error("[Shadow] Auto path failed (non-blocking):", err));
    }
    return {
        evaluationId: evaluation.id,
        decision: mswimResult.decision,
        tier: tierLabel,
        compositeScore: mswimResult.composite_score,
        interventionType,
        frictionIds,
        narrative,
        signals: mswimResult.signals,
        reasoning,
        recommendedAction: mapTierToDefaultAction(tierLabel),
        engine: "fast",
        gateOverride: mswimResult.gate_override?.toString() ?? null,
        abandonmentScore,
    };
}
// ── Full LLM engine path ─────────────────────────────────────────────────────
async function evaluateLLM(sessionId, eventIds) {
    // 1. Build context
    log.info(`[Evaluate:llm] Building context for session ${sessionId}`);
    const context = await buildContext(sessionId, eventIds);
    if (!context) {
        log.error(`[Evaluate:llm] Session ${sessionId} not found — buildContext returned null`);
        return null;
    }
    log.info(`[Evaluate:llm] Context built — ${context.newEvents.length} new events, ${context.eventHistory.length} history events`);
    // 2. Call LLM (with optional model override from experiment)
    const modelOverride = _experimentModelOverrides.get(sessionId);
    log.info(`[Evaluate:llm] Calling Groq LLM for session ${sessionId}${modelOverride ? ` (model: ${modelOverride})` : ""}...`);
    const llmOutput = await evaluateWithLLM(context, modelOverride);
    log.info(`[Evaluate:llm] LLM response received — tier signals: I=${llmOutput.signals.intent} F=${llmOutput.signals.friction}`);
    // 3. Build session context for MSWIM
    const [session, history] = await Promise.all([
        SessionRepo.getSession(sessionId),
        loadInterventionHistory(sessionId),
    ]);
    if (!session)
        return null;
    const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(session.siteUrl).catch(() => null);
    const sessionAgeSec = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    // Detect behavior patterns from the event batch (non-blocking)
    const detectedPatterns = await detectBehaviorPatterns(context.newEvents.map((e) => ({
        category: e.category ?? "unknown",
        eventType: e.eventType ?? "unknown",
        frictionId: e.frictionId,
        rawSignals: e.rawSignals,
        pageType: e.pageType,
    })), siteConfig?.id ?? "");
    const activeBehaviorGroups = extractActiveGroups(detectedPatterns);
    const sessionCtx = {
        sessionId,
        siteUrl: session.siteUrl,
        sessionAgeSec,
        pageType: context.newEvents[context.newEvents.length - 1]?.pageType ?? "other",
        isLoggedIn: session.isLoggedIn,
        isRepeatVisitor: session.isRepeatVisitor,
        cartValue: session.cartValue,
        cartItemCount: session.cartItemCount,
        deviceType: session.deviceType,
        referrerType: session.referrerType,
        eventCount: context.newEvents.length,
        ruleBasedCorroboration: llmOutput.detected_frictions.length > 0,
        totalInterventionsFired: session.totalInterventionsFired,
        totalDismissals: session.totalDismissals,
        totalNudges: history.totalNudges,
        totalActive: history.totalActive,
        totalNonPassive: history.totalNudges + history.totalActive,
        secondsSinceLastIntervention: history.secondsSinceLastIntervention,
        secondsSinceLastActive: history.secondsSinceLastActive,
        secondsSinceLastNudge: history.secondsSinceLastNudge,
        secondsSinceLastDismissal: history.secondsSinceLastDismissal,
        frictionIdsAlreadyIntervened: history.frictionIdsAlreadyIntervened,
        ...extractSessionFlags(context),
        hasTechnicalError: llmOutput.detected_frictions.some((id) => id >= "F161" && id <= "F177"),
        hasOutOfStock: llmOutput.detected_frictions.includes("F053"),
        hasShippingIssue: llmOutput.detected_frictions.some((id) => id >= "F236" && id <= "F247"),
        hasPaymentFailure: llmOutput.detected_frictions.some((id) => id === "F096" || id === "F097"),
        hasCheckoutTimeout: llmOutput.detected_frictions.includes("F112"),
        hasHelpSearch: llmOutput.detected_frictions.includes("F036"),
        detectedBehaviorPatternIds: detectedPatterns.map((p) => p.patternId),
        activeBehaviorGroups,
        scoringConfigId: _experimentConfigOverrides.get(sessionId),
    };
    // 4. Compute effective frictionIds BEFORE MSWIM so Gate 3 (duplicate friction)
    //    sees the same frictionId that will be stored on the intervention.
    //    Raw LLM output may be [] on generic page views; inferFrictionFromContext
    //    provides the canonical fallback that the intervention record will use.
    const effectiveFrictionIdsForMSWIM = llmOutput.detected_frictions.length > 0
        ? llmOutput.detected_frictions
        : [inferFrictionFromContext(sessionCtx)];
    // 4. Run MSWIM engine
    const mswimResult = await runMSWIM({
        intent: llmOutput.signals.intent,
        friction: llmOutput.signals.friction,
        clarity: llmOutput.signals.clarity,
        receptivity: llmOutput.signals.receptivity,
        value: llmOutput.signals.value,
        detectedFrictionIds: effectiveFrictionIdsForMSWIM,
        recommendedAction: llmOutput.recommended_action,
    }, sessionCtx);
    const tierLabel = TIER_LABELS[mswimResult.tier];
    const interventionType = INTERVENTION_TYPE_MAP[mswimResult.tier];
    // 5. Persist evaluation
    const evaluation = await EvaluationRepo.createEvaluation({
        sessionId,
        eventBatchIds: JSON.stringify(eventIds),
        narrative: llmOutput.narrative,
        frictionsFound: JSON.stringify(llmOutput.detected_frictions),
        intentScore: mswimResult.signals.intent,
        frictionScore: mswimResult.signals.friction,
        clarityScore: mswimResult.signals.clarity,
        receptivityScore: mswimResult.signals.receptivity,
        valueScore: mswimResult.signals.value,
        compositeScore: mswimResult.composite_score,
        weightsUsed: JSON.stringify(mswimResult.weights_used),
        tier: tierLabel,
        decision: mswimResult.decision,
        gateOverride: mswimResult.gate_override?.toString() ?? undefined,
        interventionType: interventionType ?? undefined,
        reasoning: mswimResult.reasoning,
        detectedBehaviors: detectedPatterns.length > 0 ? JSON.stringify(detectedPatterns) : undefined,
    });
    // === SHADOW MODE: Run MSWIM-no-LLM in background (non-blocking) ===
    if (config.shadow.enabled) {
        const eventFrictionIds = context.newEvents
            .map((e) => e.frictionId)
            .filter((id) => id !== null);
        const allFrictionIds = [
            ...new Set([...eventFrictionIds, ...llmOutput.detected_frictions]),
        ];
        runShadowEvaluation({
            sessionCtx,
            detectedFrictionIds: allFrictionIds,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
        })
            .then((shadow) => logShadowComparison({
            sessionId,
            evaluationId: evaluation.id,
            siteUrl: sessionCtx.siteUrl,
            prodResult: mswimResult,
            shadowResult: shadow.shadowResult,
            syntheticHints: shadow.syntheticHints,
            pageType: sessionCtx.pageType,
            eventCount: sessionCtx.eventCount,
            cartValue: sessionCtx.cartValue,
        }))
            .catch((err) => log.error("[Shadow] Failed (non-blocking):", err));
    }
    return {
        evaluationId: evaluation.id,
        decision: mswimResult.decision,
        tier: tierLabel,
        compositeScore: mswimResult.composite_score,
        interventionType,
        // Apply the same inferFrictionFromContext fallback used by fast/auto paths:
        // when the LLM returns no frictions (parse-fail or genuinely empty), avoid
        // propagating frictionId="unknown" through the intervene pipeline.
        frictionIds: llmOutput.detected_frictions.length > 0
            ? llmOutput.detected_frictions
            : [inferFrictionFromContext(sessionCtx)],
        narrative: llmOutput.narrative,
        signals: mswimResult.signals,
        reasoning: mswimResult.reasoning,
        recommendedAction: llmOutput.recommended_action,
        engine: "llm",
        gateOverride: mswimResult.gate_override?.toString() ?? null,
    };
}
async function loadInterventionHistory(sessionId) {
    const all = await InterventionRepo.getInterventionsBySession(sessionId);
    const now = Date.now();
    const totalNudges = all.filter((i) => i.type === "nudge").length;
    const totalActive = all.filter((i) => i.type === "active" || i.type === "escalate").length;
    const lastAny = all[0]; // already desc by timestamp
    const lastActive = all.find((i) => i.type === "active" || i.type === "escalate");
    const lastNudge = all.find((i) => i.type === "nudge");
    const lastDismissed = all.find((i) => i.status === "dismissed");
    const secsSince = (i) => i ? Math.floor((now - i.timestamp.getTime()) / 1000) : null;
    const frictionIdsAlreadyIntervened = [
        ...new Set(all.map((i) => i.frictionId).filter((id) => !!id)),
    ];
    return {
        totalNudges,
        totalActive,
        secondsSinceLastIntervention: secsSince(lastAny),
        secondsSinceLastActive: secsSince(lastActive),
        secondsSinceLastNudge: secsSince(lastNudge),
        secondsSinceLastDismissal: secsSince(lastDismissed),
        frictionIdsAlreadyIntervened,
    };
}
import { logger } from "../logger.js";
const log = logger.child({ service: "evaluate" });
/**
 * Extract signals needed for abandonment score computation from the event context.
 */
function extractAbandonmentSignals(context) {
    if (!context)
        return { latestScrollDepthPct: 0, latestSessionSequence: 0, priorExitIntentCount: 0 };
    const events = context.newEvents;
    const lastScrollEvent = [...events].reverse().find((e) => {
        const r = e.rawSignals;
        return r?.depth_pct != null || r?.scrollDepthPct != null;
    });
    const latestScrollDepthPct = lastScrollEvent
        ? Number(lastScrollEvent.rawSignals?.depth_pct
            ?? lastScrollEvent.rawSignals?.scrollDepthPct ?? 0)
        : 0;
    const lastSeqEvent = [...events].reverse().find((e) => {
        const r = e.rawSignals;
        return r?.session_sequence_number != null;
    });
    const latestSessionSequence = lastSeqEvent
        ? Number(lastSeqEvent.rawSignals?.session_sequence_number ?? 0)
        : 0;
    const allEvents = [...context.eventHistory, ...context.newEvents];
    const priorExitIntentCount = allEvents.filter((e) => e.eventType === "exit_intent" || e.eventType === "exit_intent_with_cart").length;
    return { latestScrollDepthPct, latestSessionSequence, priorExitIntentCount };
}
/**
 * Derive receptivity-relevant session flags from the event log.
 * These replace the earlier TODO stubs for widgetOpenedVoluntarily / idleSeconds.
 */
function extractSessionFlags(context) {
    if (!context)
        return { widgetOpenedVoluntarily: false, idleSeconds: 0, hasRecentCheckoutAbandon: false };
    const allEvents = [...context.eventHistory, ...context.newEvents];
    // idleSeconds: sum idle_ms from idle_with_cart events in this batch
    const idleMs = context.newEvents
        .filter((e) => e.eventType === "idle_with_cart")
        .reduce((sum, e) => {
        const r = e.rawSignals;
        return sum + (Number(r?.idle_ms ?? 0));
    }, 0);
    const idleSeconds = Math.round(idleMs / 1000);
    // widgetOpenedVoluntarily: true if a widget_open event exists (no SDK event yet — stays false)
    const widgetOpenedVoluntarily = allEvents.some((e) => e.eventType === "widget_open");
    // hasRecentCheckoutAbandon: exit-intent or exit-intent-with-cart in the session
    const hasRecentCheckoutAbandon = allEvents.some((e) => e.eventType === "exit_intent" ||
        e.eventType === "exit_intent_with_cart");
    return { widgetOpenedVoluntarily, idleSeconds, hasRecentCheckoutAbandon };
}
/**
 * Build session context + extract friction IDs from events.
 * Shared by fast and auto engine paths.
 */
async function buildSessionAndFrictions(sessionId, eventIds) {
    const [context, session, history] = await Promise.all([
        buildContext(sessionId, eventIds),
        SessionRepo.getSession(sessionId),
        loadInterventionHistory(sessionId),
    ]);
    if (!context) {
        log.error(`[Evaluate] Session ${sessionId} not found`);
        return { sessionCtx: null, frictionIds: [], context: null, detectedPatterns: [] };
    }
    if (!session)
        return { sessionCtx: null, frictionIds: [], context: null, detectedPatterns: [] };
    // Extract friction IDs from events (client-reported)
    const frictionIds = [
        ...new Set(context.newEvents
            .map((e) => e.frictionId)
            .filter((id) => id !== null)),
    ];
    const sessionAgeSec = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    // Detect behavior patterns (non-blocking — resolves before MSWIM but never throws)
    const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(session.siteUrl).catch(() => null);
    const detectedPatterns = await detectBehaviorPatterns(context.newEvents.map((e) => ({
        category: e.category ?? "unknown",
        eventType: e.eventType ?? "unknown",
        frictionId: e.frictionId,
        rawSignals: e.rawSignals,
        pageType: e.pageType,
    })), siteConfig?.id ?? "");
    const activeBehaviorGroups = extractActiveGroups(detectedPatterns);
    const sessionCtx = {
        sessionId,
        siteUrl: session.siteUrl,
        sessionAgeSec,
        pageType: context.newEvents[context.newEvents.length - 1]?.pageType ?? "other",
        isLoggedIn: session.isLoggedIn,
        isRepeatVisitor: session.isRepeatVisitor,
        cartValue: session.cartValue,
        cartItemCount: session.cartItemCount,
        deviceType: session.deviceType,
        referrerType: session.referrerType,
        eventCount: context.newEvents.length,
        ruleBasedCorroboration: frictionIds.length > 0,
        totalInterventionsFired: session.totalInterventionsFired,
        totalDismissals: session.totalDismissals,
        totalNudges: history.totalNudges,
        totalActive: history.totalActive,
        totalNonPassive: history.totalNudges + history.totalActive,
        secondsSinceLastIntervention: history.secondsSinceLastIntervention,
        secondsSinceLastActive: history.secondsSinceLastActive,
        secondsSinceLastNudge: history.secondsSinceLastNudge,
        secondsSinceLastDismissal: history.secondsSinceLastDismissal,
        frictionIdsAlreadyIntervened: history.frictionIdsAlreadyIntervened,
        ...extractSessionFlags(context),
        hasTechnicalError: frictionIds.some((id) => id >= "F161" && id <= "F177"),
        hasOutOfStock: frictionIds.includes("F053"),
        hasShippingIssue: frictionIds.some((id) => id >= "F236" && id <= "F247"),
        hasPaymentFailure: frictionIds.some((id) => id === "F096" || id === "F097"),
        hasCheckoutTimeout: frictionIds.includes("F112"),
        hasHelpSearch: frictionIds.includes("F036"),
        detectedBehaviorPatternIds: detectedPatterns.map((p) => p.patternId),
        activeBehaviorGroups,
        scoringConfigId: _experimentConfigOverrides.get(sessionId),
    };
    // If no event-level friction IDs were detected, infer the most contextually
    // relevant one from session state (page type, cart, gate flags).
    // This fixes frictionId="unknown" on generic browse events.
    const effectiveFrictionIds = frictionIds.length > 0
        ? frictionIds
        : [inferFrictionFromContext(sessionCtx)];
    return { sessionCtx, frictionIds: effectiveFrictionIds, context, detectedPatterns };
}
//# sourceMappingURL=evaluate.service.js.map