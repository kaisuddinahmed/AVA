export type CreateModelVersionInput = {
    provider: string;
    baseModel: string;
    modelId: string;
    fineTuneJobId?: string;
    status?: string;
    trainingDatapointCount?: number;
    qualityStats?: string;
};
export declare function createModelVersion(data: CreateModelVersionInput): Promise<any>;
export declare function getModelVersion(id: string): Promise<any>;
export declare function getActiveModel(provider: string): Promise<any>;
/**
 * Promote a model version to active. Retires any currently active model
 * for the same provider first. Only one active per provider at a time.
 */
export declare function promoteModel(id: string): Promise<any>;
export declare function retireModel(id: string): Promise<any>;
export declare function updateModelVersion(id: string, data: Partial<{
    status: string;
    fineTuneJobId: string;
    modelId: string;
    evalMetrics: string;
    qualityStats: string;
}>): Promise<any>;
export declare function listModelVersions(options?: {
    provider?: string;
    status?: string;
    limit?: number;
}): Promise<any>;
//# sourceMappingURL=model-version.repo.d.ts.map