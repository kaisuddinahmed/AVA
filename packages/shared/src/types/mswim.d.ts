/**
 * The 5 raw signal scores (each 0–100) that feed the MSWIM composite.
 */
export interface MSWIMSignals {
    intent: number;
    friction: number;
    clarity: number;
    receptivity: number;
    value: number;
}
/**
 * Configurable weights for each signal. Must sum to 1.0.
 */
export interface SignalWeights {
    intent: number;
    friction: number;
    clarity: number;
    receptivity: number;
    value: number;
}
/**
 * Tier thresholds. Score <= monitor → MONITOR, <= passive → PASSIVE, etc.
 */
export interface TierThresholds {
    monitor: number;
    passive: number;
    nudge: number;
    active: number;
}
/**
 * Gate rule configuration values (loaded from ScoringConfig).
 */
export interface GateConfig {
    minSessionAgeSec: number;
    maxActivePerSession: number;
    maxNudgePerSession: number;
    maxNonPassivePerSession: number;
    cooldownAfterActiveSec: number;
    cooldownAfterNudgeSec: number;
    cooldownAfterDismissSec: number;
    dismissalsToSuppress: number;
}
/**
 * Full MSWIM configuration — weights + thresholds + gate rules.
 */
export interface MSWIMConfig {
    weights: SignalWeights;
    thresholds: TierThresholds;
    gates: GateConfig;
}
/**
 * Output tiers from the MSWIM scoring engine.
 */
export declare enum ScoreTier {
    MONITOR = "MONITOR",
    PASSIVE = "PASSIVE",
    NUDGE = "NUDGE",
    ACTIVE = "ACTIVE",
    ESCALATE = "ESCALATE"
}
/**
 * Hard gate override reasons — when a gate fires, it overrides the score-based tier.
 */
export declare enum GateOverride {
    SESSION_TOO_YOUNG = "SESSION_TOO_YOUNG",
    RECEPTIVITY_FLOOR = "RECEPTIVITY_FLOOR",
    DISMISS_CAP = "DISMISS_CAP",
    DUPLICATE_FRICTION = "DUPLICATE_FRICTION",
    COOLDOWN_ACTIVE = "COOLDOWN_ACTIVE",
    SESSION_CAP = "SESSION_CAP",
    FORCE_PASSIVE_TECHNICAL = "FORCE_PASSIVE_TECHNICAL",
    FORCE_PASSIVE_OOS = "FORCE_PASSIVE_OOS",
    FORCE_PASSIVE_SHIPPING = "FORCE_PASSIVE_SHIPPING",
    FORCE_ESCALATE_PAYMENT = "FORCE_ESCALATE_PAYMENT",
    FORCE_ESCALATE_CHECKOUT_TIMEOUT = "FORCE_ESCALATE_CHECKOUT_TIMEOUT",
    FORCE_ESCALATE_HELP_SEARCH = "FORCE_ESCALATE_HELP_SEARCH"
}
/**
 * The final decision output from the MSWIM engine.
 */
export type MSWIMDecision = "fire" | "suppress" | "queue";
/**
 * Complete result from the MSWIM engine after evaluation.
 */
export interface MSWIMResult {
    signals: MSWIMSignals;
    weights_used: SignalWeights;
    composite_score: number;
    tier: ScoreTier;
    gate_override: GateOverride | null;
    decision: MSWIMDecision;
    reasoning: string;
}
//# sourceMappingURL=mswim.d.ts.map