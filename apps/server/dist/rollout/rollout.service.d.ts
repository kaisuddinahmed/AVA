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
export declare function createRollout(input: CreateRolloutInput): Promise<any>;
/**
 * Start a rollout (pending → rolling).
 */
export declare function startRollout(id: string): Promise<any>;
/**
 * Promote to the next stage. If final stage (100%), complete the rollout.
 */
export declare function promoteStage(id: string): Promise<any>;
/**
 * Rollback a rollout.
 */
export declare function rollbackRollout(id: string, reason: string): Promise<any>;
/**
 * Pause a rollout.
 */
export declare function pauseRollout(id: string): Promise<any>;
/**
 * List rollouts with optional filters.
 */
export declare function listRollouts(options?: {
    status?: string;
    siteUrl?: string | null;
    limit?: number;
    offset?: number;
}): Promise<any>;
/**
 * Get rollout details.
 */
export declare function getRollout(id: string): Promise<any>;
//# sourceMappingURL=rollout.service.d.ts.map