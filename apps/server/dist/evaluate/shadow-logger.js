// ============================================================================
// Shadow Logger — compares production vs shadow MSWIM results and persists
// the comparison to ShadowComparison table.
//
// This is fire-and-forget. Errors are caught and logged, never propagated.
// ============================================================================
import { DriftAlertRepo, ShadowComparisonRepo } from "@ava/db";
import { tierToString } from "./mswim/tier-resolver.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
const DRIFT_DIVERGENCE_THRESHOLD = 15; // composite points
const log = logger.child({ service: "evaluate" });
/**
 * Compare production and shadow MSWIM results, compute divergence metrics,
 * and persist the comparison.
 */
export async function logShadowComparison(input) {
    try {
        const { sessionId, evaluationId, prodResult, shadowResult, syntheticHints, pageType, eventCount, cartValue, } = input;
        const compositeDivergence = Math.abs(prodResult.composite_score - shadowResult.composite_score);
        const prodTierStr = tierToString(prodResult.tier);
        const shadowTierStr = tierToString(shadowResult.tier);
        const tierMatch = prodTierStr === shadowTierStr;
        const decisionMatch = prodResult.decision === shadowResult.decision;
        const gateOverrideMatch = (prodResult.gate_override ?? null) === (shadowResult.gate_override ?? null);
        if (config.shadow.logToConsole) {
            const symbol = tierMatch && decisionMatch ? "=" : "!";
            log.info(`[Shadow ${symbol}] session=${sessionId.slice(0, 8)} ` +
                `prod=${prodTierStr}/${prodResult.decision}(${prodResult.composite_score.toFixed(1)}) ` +
                `shadow=${shadowTierStr}/${shadowResult.decision}(${shadowResult.composite_score.toFixed(1)}) ` +
                `div=${compositeDivergence.toFixed(1)}`);
        }
        await ShadowComparisonRepo.createComparison({
            sessionId,
            evaluationId,
            prodIntentScore: prodResult.signals.intent,
            prodFrictionScore: prodResult.signals.friction,
            prodClarityScore: prodResult.signals.clarity,
            prodReceptivityScore: prodResult.signals.receptivity,
            prodValueScore: prodResult.signals.value,
            prodCompositeScore: prodResult.composite_score,
            prodTier: prodTierStr,
            prodDecision: prodResult.decision,
            prodGateOverride: prodResult.gate_override?.toString(),
            shadowIntentScore: shadowResult.signals.intent,
            shadowFrictionScore: shadowResult.signals.friction,
            shadowClarityScore: shadowResult.signals.clarity,
            shadowReceptivityScore: shadowResult.signals.receptivity,
            shadowValueScore: shadowResult.signals.value,
            shadowCompositeScore: shadowResult.composite_score,
            shadowTier: shadowTierStr,
            shadowDecision: shadowResult.decision,
            shadowGateOverride: shadowResult.gate_override?.toString(),
            compositeDivergence,
            tierMatch,
            decisionMatch,
            gateOverrideMatch,
            pageType,
            eventCount,
            cartValue,
            syntheticHints: JSON.stringify(syntheticHints),
        });
        // Create a DriftAlert when divergence exceeds threshold or tier disagrees.
        // Deduplicate within 6-hour window per CLAUDE.md spec.
        if (compositeDivergence > DRIFT_DIVERGENCE_THRESHOLD || !tierMatch) {
            const alertType = !tierMatch ? "tier_mismatch" : "composite_divergence";
            const siteUrl = input.siteUrl ?? null;
            const alreadyAlerted = await DriftAlertRepo.hasRecentAlert(alertType, "session", siteUrl, 6);
            if (!alreadyAlerted) {
                await DriftAlertRepo.createAlert({
                    siteUrl,
                    alertType,
                    severity: compositeDivergence > 25 || !tierMatch ? "high" : "medium",
                    windowType: "session",
                    metric: "composite_divergence",
                    expected: prodResult.composite_score,
                    actual: shadowResult.composite_score,
                    message: `Session ${sessionId.slice(0, 8)}: prod=${prodTierStr}(${prodResult.composite_score.toFixed(1)}) ` +
                        `vs shadow=${shadowTierStr}(${shadowResult.composite_score.toFixed(1)}), ` +
                        `divergence=${compositeDivergence.toFixed(1)}`,
                });
                log.warn(`[Shadow] DriftAlert created: type=${alertType} div=${compositeDivergence.toFixed(1)} ` +
                    `tierMatch=${tierMatch} site=${siteUrl ?? "unknown"}`);
            }
        }
    }
    catch (error) {
        // Shadow logging must NEVER crash the production path
        log.error("[Shadow] Failed to log comparison:", error);
    }
}
//# sourceMappingURL=shadow-logger.js.map