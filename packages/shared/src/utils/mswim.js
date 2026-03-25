"use strict";
// ============================================================================
// MSWIM Pure Score Calculator
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeComposite = computeComposite;
exports.resolveTier = resolveTier;
exports.validateWeights = validateWeights;
exports.normalizeSignals = normalizeSignals;
const mswim_js_1 = require("../types/mswim.js");
const helpers_js_1 = require("./helpers.js");
/**
 * Compute the MSWIM composite score from 5 signals and their weights.
 *
 * Formula:
 *   composite = (intent × w_intent) + (friction × w_friction) + (clarity × w_clarity)
 *               + (receptivity × w_receptivity) + (value × w_value)
 *
 * All signals are 0–100. Weights must sum to 1.0.
 * Result is clamped to 0–100.
 */
function computeComposite(signals, weights) {
    const raw = signals.intent * weights.intent +
        signals.friction * weights.friction +
        signals.clarity * weights.clarity +
        signals.receptivity * weights.receptivity +
        signals.value * weights.value;
    return (0, helpers_js_1.clamp)(Math.round(raw * 100) / 100, 0, 100);
}
/**
 * Resolve the composite score to a tier using the configured thresholds.
 */
function resolveTier(composite, thresholds) {
    if (composite <= thresholds.monitor)
        return mswim_js_1.ScoreTier.MONITOR;
    if (composite <= thresholds.passive)
        return mswim_js_1.ScoreTier.PASSIVE;
    if (composite <= thresholds.nudge)
        return mswim_js_1.ScoreTier.NUDGE;
    if (composite <= thresholds.active)
        return mswim_js_1.ScoreTier.ACTIVE;
    return mswim_js_1.ScoreTier.ESCALATE;
}
/**
 * Validate that signal weights sum to approximately 1.0.
 */
function validateWeights(weights) {
    const sum = weights.intent +
        weights.friction +
        weights.clarity +
        weights.receptivity +
        weights.value;
    return Math.abs(sum - 1.0) < 0.001;
}
/**
 * Clamp all signal values to 0–100.
 */
function normalizeSignals(signals) {
    return {
        intent: (0, helpers_js_1.clamp)(Math.round(signals.intent), 0, 100),
        friction: (0, helpers_js_1.clamp)(Math.round(signals.friction), 0, 100),
        clarity: (0, helpers_js_1.clamp)(Math.round(signals.clarity), 0, 100),
        receptivity: (0, helpers_js_1.clamp)(Math.round(signals.receptivity), 0, 100),
        value: (0, helpers_js_1.clamp)(Math.round(signals.value), 0, 100),
    };
}
//# sourceMappingURL=mswim.js.map