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
export declare function createExperiment(input: CreateExperimentInput): Promise<any>;
/**
 * Start an experiment (draft → running).
 */
export declare function startExperiment(id: string): Promise<any>;
/**
 * Pause a running experiment.
 */
export declare function pauseExperiment(id: string): Promise<any>;
/**
 * End an experiment (running → completed).
 */
export declare function endExperiment(id: string): Promise<any>;
/**
 * Get experiment details with parsed variants.
 */
export declare function getExperiment(id: string): Promise<any>;
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
}): Promise<any>;
//# sourceMappingURL=experiment.service.d.ts.map