/**
 * Build the evaluation prompt with session context.
 */
export declare function buildEvaluatePrompt(ctx: {
    sessionMeta: Record<string, unknown>;
    eventHistory: Array<Record<string, unknown>>;
    newEvents: Array<Record<string, unknown>>;
    previousEvaluations: Array<Record<string, unknown>>;
    previousInterventions: Array<Record<string, unknown>>;
}): string;
//# sourceMappingURL=evaluate-prompt.d.ts.map