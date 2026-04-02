// ============================================================================
// Experiment Assigner — deterministic hash-based session→variant assignment.
// Same sessionId always maps to the same variant for a given experiment.
// ============================================================================
import { createHash } from "crypto";
/**
 * Determine whether a session is enrolled in an experiment and which
 * variant it belongs to. Uses deterministic SHA-256 hashing so the
 * same sessionId always gets the same result.
 *
 * @param sessionId     The session to assign
 * @param experimentId  The experiment to assign into
 * @param variants      Variant definitions with weights (must sum to 1.0)
 * @param trafficPercent Percentage of total traffic enrolled (1-100)
 * @returns enrolled status and variant ID (null if not enrolled)
 */
export function assignVariant(sessionId, experimentId, variants, trafficPercent) {
    if (variants.length === 0) {
        return { enrolled: false, variantId: null };
    }
    // Hash sessionId + experimentId for deterministic bucketing
    const hash = createHash("sha256")
        .update(`${experimentId}:${sessionId}`)
        .digest();
    // Bucket 1: enrollment check (0-9999 for 0.01% granularity)
    const enrollmentBucket = hash.readUInt32BE(0) % 10000;
    const enrollmentThreshold = trafficPercent * 100;
    if (enrollmentBucket >= enrollmentThreshold) {
        return { enrolled: false, variantId: null };
    }
    // Bucket 2: variant assignment (separate hash region)
    const variantBucket = hash.readUInt32BE(4) % 10000;
    let cumulative = 0;
    for (const variant of variants) {
        cumulative += Math.round(variant.weight * 10000);
        if (variantBucket < cumulative) {
            return { enrolled: true, variantId: variant.id };
        }
    }
    // Fallback to last variant (handles floating-point rounding)
    return { enrolled: true, variantId: variants[variants.length - 1].id };
}
//# sourceMappingURL=experiment-assigner.js.map