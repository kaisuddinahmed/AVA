import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
export declare const FULL_ACTIVE_THRESHOLDS: {
    readonly behaviorCoveragePct: 85;
    readonly frictionCoveragePct: 80;
    readonly avgConfidence: 0.75;
};
export interface VerificationResult {
    behaviorCoveragePct: number;
    frictionCoveragePct: number;
    avgConfidence: number;
    highConfidenceBehaviorCount: number;
    highConfidenceFrictionCount: number;
    criticalJourneys: {
        addToCart: boolean;
        cart: boolean;
        checkout: boolean;
        payment: boolean;
    };
    criticalJourneysPassed: boolean;
    passesFullActive: boolean;
    recommendedMode: "active" | "limited_active";
    feedback: {
        behaviorMissing: number;
        frictionMissing: number;
        lowConfidenceBehaviorIds: string[];
        lowConfidenceFrictionIds: string[];
    };
}
export declare function verifyIntegrationReadiness(input: {
    analyzerRunId: string;
    siteConfigId: string;
    trackingHooks: TrackingHooks;
}): Promise<VerificationResult>;
//# sourceMappingURL=integration-verifier.d.ts.map