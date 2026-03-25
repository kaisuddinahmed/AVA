export type CreateAnalyzerRunInput = {
    siteConfigId: string;
    status?: string;
    phase?: string;
    behaviorCoverage?: number;
    frictionCoverage?: number;
    avgConfidence?: number;
    summary?: string;
    errorMessage?: string;
};
export type UpdateAnalyzerRunInput = Partial<{
    status: string;
    phase: string;
    behaviorCoverage: number;
    frictionCoverage: number;
    avgConfidence: number;
    summary: string | null;
    errorMessage: string | null;
    completedAt: Date | null;
}>;
export declare function createAnalyzerRun(data: CreateAnalyzerRunInput): Promise<any>;
export declare function getAnalyzerRun(id: string): Promise<any>;
export declare function updateAnalyzerRun(id: string, data: UpdateAnalyzerRunInput): Promise<any>;
export declare function setAnalyzerRunPhase(id: string, phase: string): Promise<any>;
export declare function completeAnalyzerRun(id: string, data?: Partial<{
    phase: string;
    behaviorCoverage: number;
    frictionCoverage: number;
    avgConfidence: number;
    summary: string;
}>): Promise<any>;
export declare function failAnalyzerRun(id: string, errorMessage: string): Promise<any>;
export declare function listAnalyzerRunsBySite(siteConfigId: string, limit?: number): Promise<any>;
export declare function getLatestAnalyzerRunBySite(siteConfigId: string): Promise<any>;
export declare function getAnalyzerRunWithMappings(id: string, options?: {
    behaviorLimit?: number;
    frictionLimit?: number;
}): Promise<any>;
//# sourceMappingURL=analyzer-run.repo.d.ts.map