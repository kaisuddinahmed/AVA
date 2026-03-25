/**
 * Behavior Pattern Groups — runtime-detectable classification of B001–B614.
 *
 * Each group maps catalog patterns to a signal modifier applied in the MSWIM
 * intent and clarity calculators. Detection is event-sequence-based in
 * behavior-pattern-matcher.ts — adding a new group here requires no changes
 * to the signal calculators.
 */
export type BehaviorGroup = "HIGH_INTENT" | "COMPARISON" | "HESITATION" | "DISCOVERY" | "EXIT_RISK";
export interface BehaviorGroupDefinition {
    label: string;
    description: string;
    /** MSWIM intent signal boost (negative = penalty). Applied by adjustIntent(). */
    intentBoost: number;
    /** MSWIM clarity signal boost (negative = penalty). Applied by adjustClarity(). */
    clarityBoost: number;
    /**
     * B-code IDs in this group. Data-driven: adding a pattern here
     * automatically applies the group boost when the pattern is detected.
     */
    patternIds: string[];
}
export declare const BEHAVIOR_GROUP_DEFINITIONS: Record<BehaviorGroup, BehaviorGroupDefinition>;
/**
 * Ordered priority for when multiple groups are active simultaneously.
 * EXIT_RISK is resolved first (most urgent), DISCOVERY last.
 */
export declare const BEHAVIOR_GROUP_PRIORITY: BehaviorGroup[];
/**
 * Fast lookup: patternId → group. Built once at module load.
 */
export declare const PATTERN_TO_GROUP: Map<string, BehaviorGroup>;
//# sourceMappingURL=behavior-pattern-groups.d.ts.map