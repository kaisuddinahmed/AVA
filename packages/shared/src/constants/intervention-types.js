"use strict";
// ============================================================================
// Intervention type constants and tier metadata
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTION_CODES = exports.TIER_DESCRIPTIONS = exports.TIER_COLORS = exports.TIER_LABELS = void 0;
const mswim_js_1 = require("../types/mswim.js");
exports.TIER_LABELS = {
    [mswim_js_1.ScoreTier.MONITOR]: "Monitor",
    [mswim_js_1.ScoreTier.PASSIVE]: "Passive",
    [mswim_js_1.ScoreTier.NUDGE]: "Nudge",
    [mswim_js_1.ScoreTier.ACTIVE]: "Active",
    [mswim_js_1.ScoreTier.ESCALATE]: "Escalate",
};
exports.TIER_COLORS = {
    [mswim_js_1.ScoreTier.MONITOR]: "#6b7280", // grey
    [mswim_js_1.ScoreTier.PASSIVE]: "#3b82f6", // blue
    [mswim_js_1.ScoreTier.NUDGE]: "#eab308", // yellow
    [mswim_js_1.ScoreTier.ACTIVE]: "#f97316", // orange
    [mswim_js_1.ScoreTier.ESCALATE]: "#ef4444", // red
};
exports.TIER_DESCRIPTIONS = {
    [mswim_js_1.ScoreTier.MONITOR]: "Log only, no action taken",
    [mswim_js_1.ScoreTier.PASSIVE]: "Silent UI adjustment (no widget interaction)",
    [mswim_js_1.ScoreTier.NUDGE]: "Single message bubble above widget",
    [mswim_js_1.ScoreTier.ACTIVE]: "Widget opens with cards/suggestions",
    [mswim_js_1.ScoreTier.ESCALATE]: "Maximum effort or human handoff",
};
/**
 * All possible intervention action codes.
 */
exports.ACTION_CODES = {
    // Passive
    INJECT_SHIPPING_BAR: "inject_shipping_bar",
    ENHANCE_TRUST_SIGNALS: "enhance_trust_signals",
    STICKY_PRICE_BAR: "sticky_price_bar",
    INJECT_BNPL: "inject_bnpl",
    HIGHLIGHT_ELEMENT: "highlight_element",
    // Nudge
    NUDGE_HELP_OFFER: "nudge_help_offer",
    NUDGE_COMPARISON: "nudge_comparison",
    NUDGE_PRICE_MATCH: "nudge_price_match",
    NUDGE_SIZE_HELP: "nudge_size_help",
    NUDGE_STOCK_ALERT: "nudge_stock_alert",
    NUDGE_SAVE_CART: "nudge_save_cart",
    // Active
    ACTIVE_PRODUCT_SUGGESTION: "active_product_suggestion",
    ACTIVE_COMPARISON_VIEW: "active_comparison_view",
    ACTIVE_DISCOUNT_OFFER: "active_discount_offer",
    ACTIVE_GUIDED_SEARCH: "active_guided_search",
    ACTIVE_CHECKOUT_ASSIST: "active_checkout_assist",
    // Escalate
    ESCALATE_HUMAN_HANDOFF: "escalate_human_handoff",
    ESCALATE_CALLBACK_REQUEST: "escalate_callback_request",
    ESCALATE_PRIORITY_SUPPORT: "escalate_priority_support",
};
//# sourceMappingURL=intervention-types.js.map