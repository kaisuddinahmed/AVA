import type { ExperimentVariant } from "@ava/shared";
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
export declare function assignVariant(sessionId: string, experimentId: string, variants: ExperimentVariant[], trafficPercent: number): {
    enrolled: boolean;
    variantId: string | null;
};
//# sourceMappingURL=experiment-assigner.d.ts.map