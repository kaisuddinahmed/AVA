export type CreateBehaviorMappingInput = {
    analyzerRunId: string;
    siteConfigId: string;
    patternId: string;
    patternName: string;
    mappedFunction: string;
    eventType: string;
    selector?: string;
    confidence: number;
    source: string;
    evidence?: string;
    isVerified?: boolean;
    isActive?: boolean;
};
export declare function createBehaviorMapping(data: CreateBehaviorMappingInput): Promise<any>;
export declare function createBehaviorMappings(data: CreateBehaviorMappingInput[]): Promise<any>;
export declare function getBehaviorMapping(id: string): Promise<any>;
export declare function updateBehaviorMapping(id: string, data: Partial<{
    mappedFunction: string;
    eventType: string;
    selector: string | null;
    confidence: number;
    source: string;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
}>): Promise<any>;
export declare function listBehaviorMappingsByRun(analyzerRunId: string, limit?: number): Promise<any>;
export declare function listBehaviorMappingsBySite(siteConfigId: string, limit?: number): Promise<any>;
export declare function listLowConfidenceBehaviorMappings(siteConfigId: string, threshold?: number, limit?: number): Promise<any>;
export declare function countBehaviorMappings(siteConfigId: string, analyzerRunId?: string): Promise<any>;
export declare function countDistinctBehaviorPatterns(siteConfigId: string, analyzerRunId?: string): Promise<any>;
export declare function countHighConfidenceBehaviors(siteConfigId: string, analyzerRunId?: string, threshold?: number): Promise<any>;
export declare function deleteBehaviorMappingsBySite(siteConfigId: string): Promise<any>;
//# sourceMappingURL=behavior-mapping.repo.d.ts.map