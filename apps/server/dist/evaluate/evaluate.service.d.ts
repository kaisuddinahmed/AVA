export interface EvaluationResult {
    evaluationId: string;
    decision: "fire" | "suppress" | "queue";
    tier: string;
    compositeScore: number;
    interventionType: string | null;
    frictionIds: string[];
    narrative: string;
    signals: {
        intent: number;
        friction: number;
        clarity: number;
        receptivity: number;
        value: number;
    };
    reasoning: string;
    recommendedAction: string;
    engine: "llm" | "fast";
    gateOverride?: string | null;
    abandonmentScore?: number;
}
export declare function evaluateEventBatch(sessionId: string, eventIds: string[]): Promise<EvaluationResult | null>;
/**
 * Per-session experiment config overrides. Set before MSWIM runs,
 * cleaned up after evaluation completes. Thread-safe for single-threaded Node.
 */
export declare const _experimentConfigOverrides: Map<string, string>;
/**
 * Per-session experiment model overrides. Threads modelId from experiment
 * variant to the LLM call for model A/B testing.
 */
export declare const _experimentModelOverrides: Map<string, string>;
/**
 * Get the experiment scoring config override for a session, if any.
 */
export declare function getExperimentConfigOverride(sessionId: string): string | undefined;
//# sourceMappingURL=evaluate.service.d.ts.map