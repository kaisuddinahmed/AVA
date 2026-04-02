import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
export interface FrictionMappingResult {
    totalFrictions: number;
    insertedMappings: number;
    highConfidenceMappings: number;
    avgConfidence: number;
    lowConfidenceFrictionIds: string[];
}
export declare function mapFrictionsForRun(input: {
    analyzerRunId: string;
    siteConfigId: string;
    platform: string;
    trackingHooks: TrackingHooks;
}): Promise<FrictionMappingResult>;
//# sourceMappingURL=friction-mapper.d.ts.map