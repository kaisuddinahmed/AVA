import type { SignalWeights, TierThresholds, GateConfig, MSWIMConfig } from "../types/mswim.js";
export declare const DEFAULT_WEIGHTS: SignalWeights;
export declare const DEFAULT_THRESHOLDS: TierThresholds;
export declare const DEFAULT_GATES: GateConfig;
export declare const DEFAULT_MSWIM_CONFIG: MSWIMConfig;
export declare const INTENT_FUNNEL_SCORES: Record<string, number>;
export declare const INTENT_BOOSTS: {
    readonly CART_HAS_ITEMS: 10;
    readonly USER_LOGGED_IN: 5;
    readonly REPEAT_CUSTOMER: 8;
    readonly PER_2MIN_SESSION: 3;
    readonly PER_2MIN_SESSION_MAX: 15;
    readonly WISHLIST_ADD: 5;
    readonly CHECKOUT_FORM_ENGAGED: 10;
};
export declare const INTENT_MULTIPLIERS: {
    readonly ON_CHECKOUT: 1.2;
    readonly BOUNCING_PATTERN: 0.7;
};
export declare const VALUE_CART_BRACKETS: [number, number, number][];
export declare const VALUE_BOOSTS: {
    readonly REPEAT_CUSTOMER: 15;
    readonly LOGGED_IN: 10;
    readonly PAID_ACQUISITION: 5;
};
export declare const RECEPTIVITY_BASE = 80;
export declare const RECEPTIVITY_DECREMENTS: {
    readonly PER_NON_PASSIVE_INTERVENTION: 15;
    readonly PER_DISMISSAL: 25;
    readonly RECENT_INTERVENTION: 10;
    readonly RAPID_BROWSING: 10;
    readonly MOBILE_DEVICE: 5;
};
export declare const RECEPTIVITY_INCREMENTS: {
    readonly VOLUNTARY_WIDGET_OPEN: 10;
    readonly PREVIOUS_CONVERSION: 5;
    readonly IDLE_OVER_60S: 10;
    readonly FIRST_TIME_VISITOR: 5;
};
export declare const CLARITY_ADJUSTMENTS: {
    readonly CORROBORATING_SIGNALS_3PLUS: 15;
    readonly RULE_BASED_CORROBORATION: 10;
    readonly PREVIOUS_SESSION_MATCH: 5;
    readonly LLM_AMBIGUITY_PENALTY: -20;
    readonly BEHAVIOR_CONTRADICTION: -10;
    readonly SESSION_UNDER_60S: -15;
};
//# sourceMappingURL=mswim-defaults.d.ts.map