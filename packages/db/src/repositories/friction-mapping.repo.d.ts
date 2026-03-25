export type CreateFrictionMappingInput = {
    analyzerRunId: string;
    siteConfigId: string;
    frictionId: string;
    detectorType: string;
    triggerEvent: string;
    selector?: string;
    thresholdConfig?: string;
    confidence: number;
    evidence?: string;
    isVerified?: boolean;
    isActive?: boolean;
};
export declare function createFrictionMapping(data: CreateFrictionMappingInput): Promise<any>;
export declare function createFrictionMappings(data: CreateFrictionMappingInput[]): Promise<any>;
export declare function getFrictionMapping(id: string): Promise<any>;
export declare function updateFrictionMapping(id: string, data: Partial<{
    detectorType: string;
    triggerEvent: string;
    selector: string | null;
    thresholdConfig: string | null;
    confidence: number;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
}>): Promise<any>;
export declare function listFrictionMappingsByRun(analyzerRunId: string, limit?: number): Promise<any>;
export declare function listFrictionMappingsBySite(siteConfigId: string, limit?: number): Promise<any>;
export declare function listLowConfidenceFrictionMappings(siteConfigId: string, threshold?: number, limit?: number): Promise<any>;
export declare function countFrictionMappings(siteConfigId: string, analyzerRunId?: string): Promise<any>;
export declare function countDistinctFrictions(siteConfigId: string, analyzerRunId?: string): Promise<any>;
export declare function countHighConfidenceFrictions(siteConfigId: string, analyzerRunId?: string, threshold?: number): Promise<any>;
export declare function deleteFrictionMappingsBySite(siteConfigId: string): Promise<any>;
//# sourceMappingURL=friction-mapping.repo.d.ts.map