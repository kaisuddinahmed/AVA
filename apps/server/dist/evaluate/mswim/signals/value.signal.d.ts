/**
 * Compute value signal from cart value, customer data, and channel.
 * Uses tiered cart value brackets + LTV boosts.
 */
export declare function computeValue(llmHint: number, ctx: {
    cartValue: number;
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    referrerType: string;
}): number;
//# sourceMappingURL=value.signal.d.ts.map