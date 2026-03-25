export type CreateIntegrationStatusInput = {
    siteConfigId: string;
    analyzerRunId?: string;
    status: string;
    progress?: number;
    details?: string;
};
export type UpdateIntegrationStatusInput = Partial<{
    status: string;
    progress: number;
    details: string | null;
}>;
export declare function createIntegrationStatus(data: CreateIntegrationStatusInput): Promise<any>;
export declare function getIntegrationStatus(id: string): Promise<any>;
export declare function updateIntegrationStatus(id: string, data: UpdateIntegrationStatusInput): Promise<any>;
export declare function listIntegrationStatusesBySite(siteConfigId: string, limit?: number): Promise<any>;
export declare function getLatestIntegrationStatusBySite(siteConfigId: string): Promise<any>;
export declare function getLatestIntegrationStatusByRun(analyzerRunId: string): Promise<any>;
//# sourceMappingURL=integration-status.repo.d.ts.map