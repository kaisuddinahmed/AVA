/**
 * Build the evaluation prompt with session context.
 */
export function buildEvaluatePrompt(ctx) {
    return `═══ SESSION METADATA ═══
${JSON.stringify(ctx.sessionMeta, null, 2)}

═══ EVENT HISTORY (chronological) ═══
${ctx.eventHistory
        .map((e, i) => `[${i + 1}] ${JSON.stringify(e)}`)
        .join("\n")}

═══ NEW EVENTS (this batch) ═══
${ctx.newEvents
        .map((e, i) => `[NEW-${i + 1}] ${JSON.stringify(e)}`)
        .join("\n")}

═══ PREVIOUS EVALUATIONS ═══
${ctx.previousEvaluations.length > 0
        ? ctx.previousEvaluations
            .map((e) => JSON.stringify(e))
            .join("\n")
        : "None yet."}

═══ PREVIOUS INTERVENTIONS ═══
${ctx.previousInterventions.length > 0
        ? ctx.previousInterventions
            .map((i) => JSON.stringify(i))
            .join("\n")
        : "None yet."}

Analyze the user's current session state and provide your evaluation in the required JSON format.`;
}
//# sourceMappingURL=evaluate-prompt.js.map