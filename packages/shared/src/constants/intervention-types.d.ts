import { ScoreTier } from "../types/mswim.js";
export declare const TIER_LABELS: Record<ScoreTier, string>;
export declare const TIER_COLORS: Record<ScoreTier, string>;
export declare const TIER_DESCRIPTIONS: Record<ScoreTier, string>;
/**
 * All possible intervention action codes.
 */
export declare const ACTION_CODES: {
    readonly INJECT_SHIPPING_BAR: "inject_shipping_bar";
    readonly ENHANCE_TRUST_SIGNALS: "enhance_trust_signals";
    readonly STICKY_PRICE_BAR: "sticky_price_bar";
    readonly INJECT_BNPL: "inject_bnpl";
    readonly HIGHLIGHT_ELEMENT: "highlight_element";
    readonly NUDGE_HELP_OFFER: "nudge_help_offer";
    readonly NUDGE_COMPARISON: "nudge_comparison";
    readonly NUDGE_PRICE_MATCH: "nudge_price_match";
    readonly NUDGE_SIZE_HELP: "nudge_size_help";
    readonly NUDGE_STOCK_ALERT: "nudge_stock_alert";
    readonly NUDGE_SAVE_CART: "nudge_save_cart";
    readonly ACTIVE_PRODUCT_SUGGESTION: "active_product_suggestion";
    readonly ACTIVE_COMPARISON_VIEW: "active_comparison_view";
    readonly ACTIVE_DISCOUNT_OFFER: "active_discount_offer";
    readonly ACTIVE_GUIDED_SEARCH: "active_guided_search";
    readonly ACTIVE_CHECKOUT_ASSIST: "active_checkout_assist";
    readonly ESCALATE_HUMAN_HANDOFF: "escalate_human_handoff";
    readonly ESCALATE_CALLBACK_REQUEST: "escalate_callback_request";
    readonly ESCALATE_PRIORITY_SUPPORT: "escalate_priority_support";
};
export type ActionCode = (typeof ACTION_CODES)[keyof typeof ACTION_CODES];
//# sourceMappingURL=intervention-types.d.ts.map