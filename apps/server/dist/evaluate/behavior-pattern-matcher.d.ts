/**
 * Behavior Pattern Matcher
 *
 * Detects which of the 5 behavior groups (HIGH_INTENT, COMPARISON, HESITATION,
 * DISCOVERY, EXIT_RISK) are active in the current event batch, then resolves
 * those groups to specific B-codes via the BehaviorPatternMapping table.
 *
 * Detection is event-sequence-based and data-driven through the group
 * definitions in @ava/shared — adding or reclassifying patterns requires
 * no changes here.
 */
import { type BehaviorGroup } from "@ava/shared";
export interface MatcherEvent {
    category: string;
    eventType: string;
    frictionId?: string | null;
    rawSignals?: Record<string, unknown>;
    pageType?: string;
}
export interface DetectedBehaviorPattern {
    patternId: string;
    group: BehaviorGroup;
    confidence: number;
    evidence: string[];
}
/**
 * Detect behavior patterns from the current event batch.
 *
 * 1. Classifies events into active BehaviorGroups (rule-based)
 * 2. Resolves groups → specific B-codes via BehaviorPatternMapping table
 * 3. Returns up to 10 patterns sorted by confidence (highest first)
 *
 * Never throws — returns [] on any failure so it never blocks evaluation.
 */
export declare function detectBehaviorPatterns(events: MatcherEvent[], siteConfigId: string): Promise<DetectedBehaviorPattern[]>;
/**
 * Extract the active behavior groups from a set of detected patterns.
 * Deduplicates — each group appears at most once.
 */
export declare function extractActiveGroups(patterns: DetectedBehaviorPattern[]): BehaviorGroup[];
/**
 * Compute the net intent and clarity boosts from active behavior groups.
 * Used by signal calculators.
 */
export declare function computeBehaviorBoosts(groups: BehaviorGroup[]): {
    intentBoost: number;
    clarityBoost: number;
};
export { PATTERN_TO_GROUP } from "@ava/shared";
//# sourceMappingURL=behavior-pattern-matcher.d.ts.map