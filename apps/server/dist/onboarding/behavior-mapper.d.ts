import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
export interface BehaviorMappingResult {
    totalPatterns: number;
    insertedMappings: number;
    highConfidenceMappings: number;
    avgConfidence: number;
    lowConfidencePatternIds: string[];
}
export declare function mapBehaviorsForRun(input: {
    analyzerRunId: string;
    siteConfigId: string;
    platform: string;
    trackingHooks: TrackingHooks;
}): Promise<BehaviorMappingResult>;
//# sourceMappingURL=behavior-mapper.d.ts.map