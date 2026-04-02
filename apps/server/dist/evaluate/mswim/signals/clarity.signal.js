import { BEHAVIOR_GROUP_DEFINITIONS } from "@ava/shared";
/**
 * Adjust clarity score with server-side context.
 * - +10 if rule-based detector corroborates LLM finding
 * - -15 if session is very young (< 60s)
 * - -10 if only 1-2 events in batch
 * - ±N from active behavior group clarity boosts
 */
export function adjustClarity(llmRaw, ctx) {
    let score = llmRaw;
    // Rule-based corroboration boost
    if (ctx.ruleBasedCorroboration)
        score += 10;
    // Young session penalty
    if (ctx.sessionAgeSec < 60)
        score -= 15;
    // Low event count penalty
    if (ctx.eventCount <= 2)
        score -= 10;
    // Behavior group clarity boosts
    if (ctx.activeBehaviorGroups?.length) {
        let behaviorBoost = 0;
        for (const g of ctx.activeBehaviorGroups) {
            behaviorBoost += BEHAVIOR_GROUP_DEFINITIONS[g].clarityBoost;
        }
        // Cap combined boost to ±20
        score += Math.max(-20, Math.min(20, behaviorBoost));
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}
//# sourceMappingURL=clarity.signal.js.map