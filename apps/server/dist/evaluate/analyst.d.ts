import type { EvaluationContext } from "./context-builder.js";
export interface LLMEvaluationOutput {
    narrative: string;
    detected_frictions: string[];
    signals: {
        intent: number;
        friction: number;
        clarity: number;
        receptivity: number;
        value: number;
    };
    recommended_action: string;
    reasoning: string;
}
/**
 * Call the Groq API (Llama 3.3 70B) to evaluate the session.
 */
export declare function evaluateWithLLM(context: EvaluationContext, modelOverride?: string): Promise<LLMEvaluationOutput>;
//# sourceMappingURL=analyst.d.ts.map