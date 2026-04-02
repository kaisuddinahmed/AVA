import type { TierThresholds } from "@ava/shared";
import { ScoreTier } from "@ava/shared";
/**
 * Resolve composite score to a ScoreTier using configurable thresholds.
 */
export declare function resolveTier(compositeScore: number, thresholds: TierThresholds): ScoreTier;
/**
 * Get the tier label string.
 */
export declare function tierToString(tier: ScoreTier): string;
//# sourceMappingURL=tier-resolver.d.ts.map