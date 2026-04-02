export interface EvaluationContext {
    sessionMeta: Record<string, unknown>;
    eventHistory: Array<Record<string, unknown>>;
    newEvents: Array<Record<string, unknown>>;
    previousEvaluations: Array<Record<string, unknown>>;
    previousInterventions: Array<Record<string, unknown>>;
}
/**
 * Build the full context needed for LLM evaluation.
 */
export declare function buildContext(sessionId: string, newEventIds: string[]): Promise<EvaluationContext | null>;
//# sourceMappingURL=context-builder.d.ts.map