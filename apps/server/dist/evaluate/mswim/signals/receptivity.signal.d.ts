/**
 * Compute receptivity primarily from server-side session state.
 * Starts at 80, adjusted by intervention history and user behavior.
 */
export declare function computeReceptivity(llmHint: number, ctx: {
    totalInterventionsFired: number;
    totalDismissals: number;
    secondsSinceLastIntervention: number | null;
    isMobile: boolean;
    widgetOpenedVoluntarily: boolean;
    idleSeconds: number;
    hasRecentCheckoutAbandon: boolean;
}): number;
//# sourceMappingURL=receptivity.signal.d.ts.map