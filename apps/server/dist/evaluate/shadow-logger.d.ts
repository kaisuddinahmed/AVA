import type { MSWIMResult } from "@ava/shared";
import type { LLMOutput } from "./mswim/mswim.engine.js";
export interface ComparisonInput {
    sessionId: string;
    evaluationId: string;
    siteUrl?: string;
    prodResult: MSWIMResult;
    shadowResult: MSWIMResult;
    syntheticHints: LLMOutput;
    pageType: string;
    eventCount: number;
    cartValue: number;
}
/**
 * Compare production and shadow MSWIM results, compute divergence metrics,
 * and persist the comparison.
 */
export declare function logShadowComparison(input: ComparisonInput): Promise<void>;
//# sourceMappingURL=shadow-logger.d.ts.map