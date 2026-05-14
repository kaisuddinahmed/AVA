import type { RolloutStage, RolloutHealthCriteria } from "@ava/shared";
export interface CreateRolloutInput {
    name: string;
    siteUrl?: string | null;
    changeType: "scoring_config" | "eval_engine" | "gate_thresholds";
    newConfigId?: string;
    newEvalEngine?: "llm" | "fast" | "auto";
    configPayload?: string;
    stages: RolloutStage[];
    healthCriteria: RolloutHealthCriteria;
}
/**
 * Create a new rollout with a linked experiment for traffic splitting.
 */
export declare function createRollout(input: CreateRolloutInput): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
}>;
/**
 * Start a rollout (pending → rolling).
 */
export declare function startRollout(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
}>;
/**
 * Promote to the next stage. If final stage (100%), complete the rollout.
 */
export declare function promoteStage(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
} | null>;
/**
 * Rollback a rollout.
 */
export declare function rollbackRollout(id: string, reason: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
}>;
/**
 * Pause a rollout.
 */
export declare function pauseRollout(id: string): Promise<{
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
}>;
/**
 * List rollouts with optional filters.
 */
export declare function listRollouts(options?: {
    status?: string;
    siteUrl?: string | null;
    limit?: number;
    offset?: number;
}): Promise<({
    experiment: {
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
    } | null;
} & {
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
})[]>;
/**
 * Get rollout details.
 */
export declare function getRollout(id: string): Promise<{
    parsedStages: RolloutStage[];
    parsedHealthCriteria: RolloutHealthCriteria;
    experiment: {
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
    } | null;
    name: string;
    id: string;
    siteUrl: string | null;
    startedAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    experimentId: string | null;
    changeType: string;
    newConfigId: string | null;
    newEvalEngine: string | null;
    configPayload: string | null;
    stages: string;
    currentStage: number;
    healthCriteria: string;
    rolledBackAt: Date | null;
    rollbackReason: string | null;
    lastHealthCheck: Date | null;
    lastHealthStatus: string | null;
} | null>;
//# sourceMappingURL=rollout.service.d.ts.map