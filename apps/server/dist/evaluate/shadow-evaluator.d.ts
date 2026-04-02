import { type LLMOutput, type SessionContext } from "./mswim/mswim.engine.js";
import type { MSWIMResult } from "@ava/shared";
export interface ShadowEvaluationInput {
    sessionCtx: SessionContext;
    detectedFrictionIds: string[];
    pageType: string;
    eventCount: number;
}
export interface ShadowEvaluationOutput {
    shadowResult: MSWIMResult;
    syntheticHints: LLMOutput;
}
/**
 * Run the shadow MSWIM evaluation using synthetic (rule-derived) LLM hints.
 * Zero LLM API calls. Same runMSWIM() engine as production.
 */
export declare function runShadowEvaluation(input: ShadowEvaluationInput): Promise<ShadowEvaluationOutput>;
//# sourceMappingURL=shadow-evaluator.d.ts.map