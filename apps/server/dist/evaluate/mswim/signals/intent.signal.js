import { INTENT_FUNNEL_SCORES, INTENT_BOOSTS, BEHAVIOR_GROUP_DEFINITIONS } from "@ava/shared";
/**
 * Adjust the LLM's raw intent score using server-side signals.
 * - Funnel position boost (landing=10, checkout=85)
 * - Logged-in + repeat visitor boosts
 * - Cart value boost
 */
export function adjustIntent(llmRaw, ctx) {
    let score = llmRaw;
    // Funnel position bonus
    const funnelBonus = INTENT_FUNNEL_SCORES[ctx.pageType] ?? 0;
    score += funnelBonus;
    // Logged-in boost
    if (ctx.isLoggedIn)
        score += INTENT_BOOSTS.USER_LOGGED_IN;
    // Repeat visitor boost
    if (ctx.isRepeatVisitor)
        score += INTENT_BOOSTS.REPEAT_CUSTOMER;
    // Cart value boost (tiered)
    if (ctx.cartItemCount > 0) {
        score += INTENT_BOOSTS.CART_HAS_ITEMS;
        if (ctx.cartValue > 100)
            score += 5;
        if (ctx.cartValue > 250)
            score += 5;
    }
    // Behavior group intent boosts
    if (ctx.activeBehaviorGroups?.length) {
        let behaviorBoost = 0;
        for (const g of ctx.activeBehaviorGroups) {
            behaviorBoost += BEHAVIOR_GROUP_DEFINITIONS[g].intentBoost;
        }
        // Cap combined boost to ±20
        score += Math.max(-20, Math.min(20, behaviorBoost));
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}
//# sourceMappingURL=intent.signal.js.map