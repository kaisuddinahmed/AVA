export type CreateJobRunInput = {
    jobName: string;
    triggeredBy?: string;
};
export declare function createJobRun(data: CreateJobRunInput): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
}>;
export declare function completeJobRun(id: string, summary: Record<string, unknown>, durationMs: number): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
}>;
export declare function failJobRun(id: string, errorMessage: string, durationMs: number): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
}>;
export declare function getJobRun(id: string): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
} | null>;
export declare function listJobRuns(options?: {
    jobName?: string;
    status?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
}[]>;
export declare function getLastRun(jobName: string): Promise<{
    status: string;
    durationMs: number | null;
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: string | null;
    errorMessage: string | null;
    jobName: string;
    triggeredBy: string;
} | null>;
export declare function pruneOldRuns(olderThan: Date): Promise<import(".prisma/client").Prisma.BatchPayload>;
//# sourceMappingURL=job-run.repo.d.ts.map