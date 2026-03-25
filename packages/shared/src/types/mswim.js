"use strict";
// ============================================================================
// MSWIM — Multi-Signal Weighted Intervention Model
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.GateOverride = exports.ScoreTier = void 0;
/**
 * Output tiers from the MSWIM scoring engine.
 */
var ScoreTier;
(function (ScoreTier) {
    ScoreTier["MONITOR"] = "MONITOR";
    ScoreTier["PASSIVE"] = "PASSIVE";
    ScoreTier["NUDGE"] = "NUDGE";
    ScoreTier["ACTIVE"] = "ACTIVE";
    ScoreTier["ESCALATE"] = "ESCALATE";
})(ScoreTier || (exports.ScoreTier = ScoreTier = {}));
/**
 * Hard gate override reasons — when a gate fires, it overrides the score-based tier.
 */
var GateOverride;
(function (GateOverride) {
    // Suppress gates (block non-passive)
    GateOverride["SESSION_TOO_YOUNG"] = "SESSION_TOO_YOUNG";
    GateOverride["RECEPTIVITY_FLOOR"] = "RECEPTIVITY_FLOOR";
    GateOverride["DISMISS_CAP"] = "DISMISS_CAP";
    GateOverride["DUPLICATE_FRICTION"] = "DUPLICATE_FRICTION";
    GateOverride["COOLDOWN_ACTIVE"] = "COOLDOWN_ACTIVE";
    GateOverride["SESSION_CAP"] = "SESSION_CAP";
    // Force-passive gates (bypass scoring, fire as passive)
    GateOverride["FORCE_PASSIVE_TECHNICAL"] = "FORCE_PASSIVE_TECHNICAL";
    GateOverride["FORCE_PASSIVE_OOS"] = "FORCE_PASSIVE_OOS";
    GateOverride["FORCE_PASSIVE_SHIPPING"] = "FORCE_PASSIVE_SHIPPING";
    // Force-escalate gates (bypass scoring, fire as escalate)
    GateOverride["FORCE_ESCALATE_PAYMENT"] = "FORCE_ESCALATE_PAYMENT";
    GateOverride["FORCE_ESCALATE_CHECKOUT_TIMEOUT"] = "FORCE_ESCALATE_CHECKOUT_TIMEOUT";
    GateOverride["FORCE_ESCALATE_HELP_SEARCH"] = "FORCE_ESCALATE_HELP_SEARCH";
})(GateOverride || (exports.GateOverride = GateOverride = {}));
//# sourceMappingURL=mswim.js.map