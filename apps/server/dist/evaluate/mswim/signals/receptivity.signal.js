import { RECEPTIVITY_BASE, RECEPTIVITY_DECREMENTS, RECEPTIVITY_INCREMENTS, } from "@ava/shared";
/**
 * Compute receptivity primarily from server-side session state.
 * Starts at 80, adjusted by intervention history and user behavior.
 */
export function computeReceptivity(llmHint, ctx) {
    let score = RECEPTIVITY_BASE; // 80
    // Decrements
    score -= ctx.totalInterventionsFired * RECEPTIVITY_DECREMENTS.PER_NON_PASSIVE_INTERVENTION; // -15 each
    score -= ctx.totalDismissals * RECEPTIVITY_DECREMENTS.PER_DISMISSAL; // -25 each
    if (ctx.secondsSinceLastIntervention !== null &&
        ctx.secondsSinceLastIntervention < 120) {
        score -= RECEPTIVITY_DECREMENTS.RECENT_INTERVENTION; // -10
    }
    if (ctx.isMobile) {
        score -= RECEPTIVITY_DECREMENTS.MOBILE_DEVICE; // -5
    }
    // Exit-intent during checkout or with cart — user is pulling away, lower receptivity
    if (ctx.hasRecentCheckoutAbandon) {
        score -= RECEPTIVITY_DECREMENTS.CHECKOUT_ABANDON; // -30
    }
    // Increments
    if (ctx.widgetOpenedVoluntarily) {
        score += RECEPTIVITY_INCREMENTS.VOLUNTARY_WIDGET_OPEN; // +10
    }
    if (ctx.idleSeconds > 60) {
        score += RECEPTIVITY_INCREMENTS.IDLE_OVER_60S; // +10
    }
    // Blend in LLM hint (10% weight)
    score = score * 0.9 + llmHint * 0.1;
    return Math.max(0, Math.min(100, Math.round(score)));
}
//# sourceMappingURL=receptivity.signal.js.map