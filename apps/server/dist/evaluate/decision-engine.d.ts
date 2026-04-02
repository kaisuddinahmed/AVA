import type { EvaluationResult } from "./evaluate.service.js";
export interface DecisionOutput {
    decision: "fire" | "suppress" | "queue";
    type: string | null;
    actionCode: string;
    frictionId: string;
    evaluationId: string;
}
/**
 * Combine MSWIM tier + LLM recommendation + gate overrides into final decision.
 */
export declare function makeDecision(evaluation: EvaluationResult): DecisionOutput;
//# sourceMappingURL=decision-engine.d.ts.map