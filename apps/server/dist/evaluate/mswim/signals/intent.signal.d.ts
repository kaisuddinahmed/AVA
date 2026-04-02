import { type BehaviorGroup } from "@ava/shared";
/**
 * Adjust the LLM's raw intent score using server-side signals.
 * - Funnel position boost (landing=10, checkout=85)
 * - Logged-in + repeat visitor boosts
 * - Cart value boost
 */
export declare function adjustIntent(llmRaw: number, ctx: {
    pageType: string;
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    cartValue: number;
    cartItemCount: number;
    activeBehaviorGroups?: BehaviorGroup[];
}): number;
//# sourceMappingURL=intent.signal.d.ts.map