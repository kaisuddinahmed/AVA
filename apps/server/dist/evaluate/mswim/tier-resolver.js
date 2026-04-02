import { ScoreTier } from "@ava/shared";
/**
 * Resolve composite score to a ScoreTier using configurable thresholds.
 */
export function resolveTier(compositeScore, thresholds) {
    if (compositeScore <= thresholds.monitor)
        return ScoreTier.MONITOR;
    if (compositeScore <= thresholds.passive)
        return ScoreTier.PASSIVE;
    if (compositeScore <= thresholds.nudge)
        return ScoreTier.NUDGE;
    if (compositeScore <= thresholds.active)
        return ScoreTier.ACTIVE;
    return ScoreTier.ESCALATE;
}
/**
 * Get the tier label string.
 */
export function tierToString(tier) {
    const labels = {
        [ScoreTier.MONITOR]: "MONITOR",
        [ScoreTier.PASSIVE]: "PASSIVE",
        [ScoreTier.NUDGE]: "NUDGE",
        [ScoreTier.ACTIVE]: "ACTIVE",
        [ScoreTier.ESCALATE]: "ESCALATE",
    };
    return labels[tier];
}
//# sourceMappingURL=tier-resolver.js.map