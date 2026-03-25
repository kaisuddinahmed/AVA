export type CreateExperimentInput = {
    name: string;
    description?: string;
    siteUrl?: string | null;
    trafficPercent?: number;
    variants: string;
    primaryMetric?: string;
    minSampleSize?: number;
};
export declare function createExperiment(data: CreateExperimentInput): Promise<{
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
export declare function getExperiment(id: string): Promise<({
    _count: {
        assignments: number;
    };
} & {
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}) | null>;
export declare function updateExperiment(id: string, data: Partial<{
    name: string;
    description: string;
    status: string;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
    startedAt: Date;
    endedAt: Date;
}>): Promise<{
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
export declare function startExperiment(id: string): Promise<{
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
export declare function endExperiment(id: string): Promise<{
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
}>;
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
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
})[]>;
/**
 * Get the active (running) experiment for a site.
 * A session's site may match a site-specific experiment OR a global (null siteUrl) one.
 */
export declare function getActiveExperiment(siteUrl?: string): Promise<{
    status: string;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    trafficPercent: number;
    variants: string;
    primaryMetric: string;
    minSampleSize: number;
} | null>;
export declare function assignSession(experimentId: string, sessionId: string, variantId: string): Promise<{
    id: string;
    sessionId: string;
    experimentId: string;
    variantId: string;
    assignedAt: Date;
}>;
export declare function getSessionAssignment(experimentId: string, sessionId: string): Promise<{
    id: string;
    sessionId: string;
    experimentId: string;
    variantId: string;
    assignedAt: Date;
} | null>;
/**
 * Get per-variant outcome counts by joining assignments → interventions.
 * Returns raw counts for each variant: total, converted, dismissed, ignored.
 */
export declare function getVariantOutcomes(experimentId: string): Promise<{
    variantId: string;
    total: number;
    converted: number;
    dismissed: number;
    ignored: number;
    avgCompositeScore: number;
    avgIntentScore: number;
    avgFrictionScore: number;
}[]>;
//# sourceMappingURL=experiment.repo.d.ts.map