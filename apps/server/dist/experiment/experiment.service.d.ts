import type { ExperimentVariant, ExperimentResult } from "@ava/shared";
export interface CreateExperimentInput {
    name: string;
    description?: string;
    siteUrl?: string | null;
    trafficPercent?: number;
    variants: ExperimentVariant[];
    primaryMetric?: string;
    minSampleSize?: number;
}
/**
 * Create a new experiment in draft status.
 */
export declare function createExperiment(input: CreateExperimentInput): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
/**
 * Start an experiment (draft → running).
 */
export declare function startExperiment(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
/**
 * Pause a running experiment.
 */
export declare function pauseExperiment(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
/**
 * End an experiment (running → completed).
 */
export declare function endExperiment(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
/**
 * Get experiment details with parsed variants.
 */
export declare function getExperiment(id: string): Promise<{
    parsedVariants: ExperimentVariant[];
    _count: {
        assignments: number;
    };
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
} | null>;
/**
 * Get experiment results with metrics and significance testing.
 */
export declare function getResults(id: string): Promise<ExperimentResult>;
/**
 * List experiments with optional filters.
 */
export declare function listExperiments(options?: {
    status?: string;
    siteUrl?: string | null;
    limit?: number;
    offset?: number;
}): Promise<({
    _count: {
        assignments: number;
    };
} & {
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
})[]>;
//# sourceMappingURL=experiment.service.d.ts.map