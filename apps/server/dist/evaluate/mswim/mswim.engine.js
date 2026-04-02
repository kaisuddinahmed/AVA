import { ScoreTier } from "@ava/shared";
import { computeComposite } from "@ava/shared";
import { adjustIntent } from "./signals/intent.signal.js";
import { adjustFriction } from "./signals/friction.signal.js";
import { adjustClarity } from "./signals/clarity.signal.js";
import { computeReceptivity } from "./signals/receptivity.signal.js";
import { computeValue } from "./signals/value.signal.js";
import { runGateChecks } from "./gate-checks.js";
import { resolveTier, tierToString } from "./tier-resolver.js";
import { loadMSWIMConfig } from "./config-loader.js";
/**
 * Main MSWIM scoring pipeline:
 * LLM signals + session state → adjusted signals → composite → gates → tier → decision
 */
export async function runMSWIM(llmOutput, sessionCtx) {
    // 1. Load config (per-site or global, cached; experiment override if set)
    const config = await loadMSWIMConfig(sessionCtx.siteUrl, sessionCtx.scoringConfigId);
    // 2. Adjust each signal
    const signals = {
        intent: adjustIntent(llmOutput.intent, {
            pageType: sessionCtx.pageType,
            isLoggedIn: sessionCtx.isLoggedIn,
            isRepeatVisitor: sessionCtx.isRepeatVisitor,
            cartValue: sessionCtx.cartValue,
            cartItemCount: sessionCtx.cartItemCount,
            activeBehaviorGroups: sessionCtx.activeBehaviorGroups,
        }),
        friction: adjustFriction(llmOutput.friction, llmOutput.detectedFrictionIds),
        clarity: adjustClarity(llmOutput.clarity, {
            sessionAgeSec: sessionCtx.sessionAgeSec,
            eventCount: sessionCtx.eventCount,
            ruleBasedCorroboration: sessionCtx.ruleBasedCorroboration,
            activeBehaviorGroups: sessionCtx.activeBehaviorGroups,
        }),
        receptivity: computeReceptivity(llmOutput.receptivity, {
            totalInterventionsFired: sessionCtx.totalInterventionsFired,
            totalDismissals: sessionCtx.totalDismissals,
            secondsSinceLastIntervention: sessionCtx.secondsSinceLastIntervention,
            isMobile: sessionCtx.deviceType === "mobile",
            widgetOpenedVoluntarily: sessionCtx.widgetOpenedVoluntarily,
            idleSeconds: sessionCtx.idleSeconds,
            hasRecentCheckoutAbandon: sessionCtx.hasRecentCheckoutAbandon,
        }),
        value: computeValue(llmOutput.value, {
            cartValue: sessionCtx.cartValue,
            isLoggedIn: sessionCtx.isLoggedIn,
            isRepeatVisitor: sessionCtx.isRepeatVisitor,
            referrerType: sessionCtx.referrerType,
        }),
    };
    // 3. Compute weighted composite
    const composite_score = computeComposite(signals, config.weights);
    // 4. Resolve tier
    let tier = resolveTier(composite_score, config.thresholds);
    // 5. Run gate checks
    const gateCtx = {
        sessionAgeSec: sessionCtx.sessionAgeSec,
        totalInterventionsFired: sessionCtx.totalInterventionsFired,
        totalDismissals: sessionCtx.totalDismissals,
        totalNudges: sessionCtx.totalNudges,
        totalActive: sessionCtx.totalActive,
        totalNonPassive: sessionCtx.totalNonPassive,
        secondsSinceLastIntervention: sessionCtx.secondsSinceLastIntervention,
        secondsSinceLastActive: sessionCtx.secondsSinceLastActive,
        secondsSinceLastNudge: sessionCtx.secondsSinceLastNudge,
        secondsSinceLastDismissal: sessionCtx.secondsSinceLastDismissal,
        frictionIdsAlreadyIntervened: sessionCtx.frictionIdsAlreadyIntervened,
        currentFrictionIds: llmOutput.detectedFrictionIds,
        hasTechnicalError: sessionCtx.hasTechnicalError,
        hasOutOfStock: sessionCtx.hasOutOfStock,
        hasShippingIssue: sessionCtx.hasShippingIssue,
        hasPaymentFailure: sessionCtx.hasPaymentFailure,
        hasCheckoutTimeout: sessionCtx.hasCheckoutTimeout,
        hasHelpSearch: sessionCtx.hasHelpSearch,
    };
    const gateResult = runGateChecks(tier, config.gates, gateCtx);
    // 6. Apply gate overrides
    let decision = "fire";
    let gate_override = gateResult.override;
    if (gateResult.action === "suppress") {
        decision = "suppress";
    }
    else if (gateResult.action === "force_passive") {
        tier = ScoreTier.PASSIVE;
        decision = "fire";
    }
    else if (gateResult.action === "force_escalate") {
        tier = ScoreTier.ESCALATE;
        decision = "fire";
    }
    else {
        // No gate override — use tier to determine decision
        if (tier === ScoreTier.MONITOR) {
            decision = "suppress";
        }
        else {
            decision = "fire";
        }
    }
    // 7. Build reasoning
    const reasoning = buildReasoning(signals, composite_score, tier, gateResult, decision);
    return {
        signals,
        weights_used: config.weights,
        composite_score,
        tier,
        gate_override,
        decision,
        reasoning,
    };
}
function buildReasoning(signals, composite, tier, gateResult, decision) {
    const parts = [];
    parts.push(`Composite=${composite.toFixed(1)} → ${tierToString(tier)}.`);
    parts.push(`Signals: I=${signals.intent} F=${signals.friction} C=${signals.clarity} R=${signals.receptivity} V=${signals.value}.`);
    if (gateResult.override) {
        parts.push(`Gate override: ${gateResult.override} → ${gateResult.action}.`);
    }
    parts.push(`Decision: ${decision}.`);
    return parts.join(" ");
}
//# sourceMappingURL=mswim.engine.js.map