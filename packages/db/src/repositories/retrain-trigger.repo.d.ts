export declare function createTrigger(data: {
    reason: string;
    trainingDatapointCount: number;
    status?: string;
}): Promise<any>;
export declare function updateTrigger(id: string, data: Partial<{
    modelVersionId: string;
    status: string;
    completedAt: Date;
    error: string;
}>): Promise<any>;
export declare function getLastTrigger(): Promise<any>;
export declare function listTriggers(options?: {
    limit?: number;
    offset?: number;
}): Promise<any>;
export declare function getActiveTrigger(): Promise<any>;
//# sourceMappingURL=retrain-trigger.repo.d.ts.map