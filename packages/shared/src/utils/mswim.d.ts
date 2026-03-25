import type { MSWIMSignals, SignalWeights, TierThresholds } from "../types/mswim.js";
import { ScoreTier } from "../types/mswim.js";
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
export declare function computeComposite(signals: MSWIMSignals, weights: SignalWeights): number;
/**
 * Resolve the composite score to a tier using the configured thresholds.
 */
export declare function resolveTier(composite: number, thresholds: TierThresholds): ScoreTier;
/**
 * Validate that signal weights sum to approximately 1.0.
 */
export declare function validateWeights(weights: SignalWeights): boolean;
/**
 * Clamp all signal values to 0–100.
 */
export declare function normalizeSignals(signals: MSWIMSignals): MSWIMSignals;
//# sourceMappingURL=mswim.d.ts.map