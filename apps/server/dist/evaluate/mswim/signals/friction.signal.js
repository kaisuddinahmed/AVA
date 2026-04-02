import { getSeverity } from "@ava/shared";
/**
 * Adjust friction score using catalog severity cross-reference.
 * - Uses max(LLM score, catalog severity) for primary friction
 * - Multiple frictions: +5 per additional (max +15 boost)
 */
export function adjustFriction(llmRaw, detectedFrictionIds) {
    if (detectedFrictionIds.length === 0) {
        return Math.max(0, Math.min(100, Math.round(llmRaw)));
    }
    // Get severity scores from catalog
    const severities = detectedFrictionIds.map((id) => getSeverity(id));
    const maxSeverity = Math.max(...severities);
    // Use higher of LLM score and catalog severity
    let score = Math.max(llmRaw, maxSeverity);
    // Multiple frictions boost: +5 per additional, max +15
    const additionalFrictions = Math.min(detectedFrictionIds.length - 1, 3);
    score += additionalFrictions * 5;
    return Math.max(0, Math.min(100, Math.round(score)));
}
//# sourceMappingURL=friction.signal.js.map