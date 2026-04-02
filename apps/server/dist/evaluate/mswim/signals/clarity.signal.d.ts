import { type BehaviorGroup } from "@ava/shared";
/**
 * Adjust clarity score with server-side context.
 * - +10 if rule-based detector corroborates LLM finding
 * - -15 if session is very young (< 60s)
 * - -10 if only 1-2 events in batch
 * - ±N from active behavior group clarity boosts
 */
export declare function adjustClarity(llmRaw: number, ctx: {
    sessionAgeSec: number;
    eventCount: number;
    ruleBasedCorroboration: boolean;
    activeBehaviorGroups?: BehaviorGroup[];
}): number;
//# sourceMappingURL=clarity.signal.d.ts.map