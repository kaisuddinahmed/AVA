import { getMessageTemplate } from "./message-templates.js";
import { extractProductsFromEvents, findAlternatives, findComplementary, buildComparison, } from "./product-intelligence.js";
/**
 * Build the intervention payload to send to the widget.
 * sessionEvents is optional — if provided, ACTIVE and ESCALATE payloads
 * will include real product suggestions derived from browsing history.
 * voiceDisabled should be true when the session voice budget is exhausted
 * or the user has muted voice interventions.
 */
export async function buildPayload(type, actionCode, frictionId, evaluation, sessionEvents, voiceDisabled, sessionCtx) {
    const template = getMessageTemplate(type, frictionId, sessionCtx);
    // Voice is enabled for nudge/active/escalate tiers only, when the template
    // has a voice script, and the session budget has not been exhausted/muted.
    const isVoiceTier = type === "nudge" || type === "active" || type === "escalate";
    const voiceEnabled = isVoiceTier && !!template.voiceScript && !voiceDisabled;
    // Keys use snake_case to match widget's InterventionPayload interface
    const base = {
        type,
        action_code: actionCode,
        friction_id: frictionId,
        message: template.message,
        tier: evaluation.tier,
        timestamp: new Date().toISOString(),
        voice_enabled: voiceEnabled,
        voice_script: voiceEnabled ? template.voiceScript : undefined,
    };
    switch (type) {
        case "passive":
            return {
                ...base,
                ui_adjustment: template.uiAdjustments?.[0] ?? null,
                silent: true,
                voice_enabled: false, // passive interventions are always silent
                voice_script: undefined,
            };
        case "nudge":
            return {
                ...base,
                cta_label: template.ctaLabel ?? "Learn more",
                cta_action: template.ctaAction ?? "open",
                dismissable: true,
                autoHideMs: 8000,
            };
        case "active": {
            const events = sessionEvents ?? [];
            const browsed = extractProductsFromEvents(events);
            const context = {
                events,
                cartValue: 0,
                frictionIds: evaluation.frictionIds,
            };
            const alternatives = findAlternatives(frictionId, context);
            const complementary = alternatives.length > 0
                ? findComplementary(alternatives[0].id, { events })
                : [];
            const products = [...alternatives, ...complementary].slice(0, 4);
            const comparison = buildComparison(products, browsed);
            return {
                ...base,
                showPanel: true,
                products,
                comparison,
            };
        }
        case "escalate": {
            const events = sessionEvents ?? [];
            const browsed = extractProductsFromEvents(events);
            const context = {
                events,
                cartValue: 0,
                frictionIds: evaluation.frictionIds,
            };
            const alternatives = findAlternatives(frictionId, context);
            const complementary = alternatives.length > 0
                ? findComplementary(alternatives[0].id, { events })
                : [];
            const products = [...alternatives, ...complementary].slice(0, 4);
            const comparison = buildComparison(products, browsed);
            // Offer a discount based on value signal: high value = 10%, very high = 15%
            const discountPct = evaluation.signals.value >= 80
                ? 15
                : evaluation.signals.value >= 60
                    ? 10
                    : 0;
            return {
                ...base,
                showPanel: true,
                urgent: true,
                products,
                comparison,
                offerDiscount: evaluation.tier === "ESCALATE",
                discountPct: discountPct > 0 ? discountPct : undefined,
            };
        }
        default:
            return base;
    }
}
//# sourceMappingURL=payload-builder.js.map