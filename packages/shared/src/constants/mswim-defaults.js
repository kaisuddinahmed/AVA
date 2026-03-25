"use strict";
// ============================================================================
// MSWIM Default Configuration
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLARITY_ADJUSTMENTS = exports.RECEPTIVITY_INCREMENTS = exports.RECEPTIVITY_DECREMENTS = exports.RECEPTIVITY_BASE = exports.VALUE_BOOSTS = exports.VALUE_CART_BRACKETS = exports.INTENT_MULTIPLIERS = exports.INTENT_BOOSTS = exports.INTENT_FUNNEL_SCORES = exports.DEFAULT_MSWIM_CONFIG = exports.DEFAULT_GATES = exports.DEFAULT_THRESHOLDS = exports.DEFAULT_WEIGHTS = void 0;
// --- Default signal weights (must sum to 1.0) ---
exports.DEFAULT_WEIGHTS = {
    intent: 0.25,
    friction: 0.25,
    clarity: 0.15,
    receptivity: 0.20,
    value: 0.15,
};
// --- Default tier thresholds ---
exports.DEFAULT_THRESHOLDS = {
    monitor: 29,
    passive: 49,
    nudge: 64,
    active: 79,
    // 80+ = ESCALATE
};
// --- Default gate configuration ---
exports.DEFAULT_GATES = {
    minSessionAgeSec: 30,
    maxActivePerSession: 2,
    maxNudgePerSession: 3,
    maxNonPassivePerSession: 6,
    cooldownAfterActiveSec: 120,
    cooldownAfterNudgeSec: 60,
    cooldownAfterDismissSec: 300,
    dismissalsToSuppress: 3,
};
// --- Combined default config ---
exports.DEFAULT_MSWIM_CONFIG = {
    weights: exports.DEFAULT_WEIGHTS,
    thresholds: exports.DEFAULT_THRESHOLDS,
    gates: exports.DEFAULT_GATES,
};
// --- Intent signal: funnel position base scores ---
exports.INTENT_FUNNEL_SCORES = {
    landing: 10,
    category: 25,
    search_results: 30,
    pdp: 45,
    cart: 70,
    checkout: 85,
    account: 20,
    other: 15,
};
// --- Intent signal: additive boosts ---
exports.INTENT_BOOSTS = {
    CART_HAS_ITEMS: 10,
    USER_LOGGED_IN: 5,
    REPEAT_CUSTOMER: 8,
    PER_2MIN_SESSION: 3,
    PER_2MIN_SESSION_MAX: 15,
    WISHLIST_ADD: 5,
    CHECKOUT_FORM_ENGAGED: 10,
};
// --- Intent signal: multiplicative ---
exports.INTENT_MULTIPLIERS = {
    ON_CHECKOUT: 1.2,
    BOUNCING_PATTERN: 0.7,
};
// --- Value signal: cart value brackets ---
exports.VALUE_CART_BRACKETS = [
    //  [maxCartValue, score]
    [20, 15, 0],
    [50, 30, 0],
    [100, 50, 0],
    [200, 70, 0],
    [500, 85, 0],
    [Infinity, 95, 0],
];
// --- Value signal: LTV boosts ---
exports.VALUE_BOOSTS = {
    REPEAT_CUSTOMER: 15,
    LOGGED_IN: 10,
    PAID_ACQUISITION: 5,
};
// --- Receptivity signal: base and adjustments ---
exports.RECEPTIVITY_BASE = 80;
exports.RECEPTIVITY_DECREMENTS = {
    PER_NON_PASSIVE_INTERVENTION: 15,
    PER_DISMISSAL: 25,
    RECENT_INTERVENTION: 10, // last intervention < 2 min ago
    RAPID_BROWSING: 10, // < 5 sec per page
    MOBILE_DEVICE: 5,
};
exports.RECEPTIVITY_INCREMENTS = {
    VOLUNTARY_WIDGET_OPEN: 10,
    PREVIOUS_CONVERSION: 5,
    IDLE_OVER_60S: 10,
    FIRST_TIME_VISITOR: 5,
};
// --- Clarity signal: adjustments ---
exports.CLARITY_ADJUSTMENTS = {
    CORROBORATING_SIGNALS_3PLUS: 15,
    RULE_BASED_CORROBORATION: 10,
    PREVIOUS_SESSION_MATCH: 5,
    LLM_AMBIGUITY_PENALTY: -20,
    BEHAVIOR_CONTRADICTION: -10,
    SESSION_UNDER_60S: -15,
};
//# sourceMappingURL=mswim-defaults.js.map