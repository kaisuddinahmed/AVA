import type { HealthCheckResult } from "@ava/shared";
/**
 * Evaluate the health of a single rollout's current stage.
 */
export declare function evaluateRolloutHealth(rolloutId: string): Promise<HealthCheckResult>;
/**
 * Check all active rollouts, auto-promote or rollback.
 * Called by the nightly batch and canary check timer.
 */
export declare function checkAllRolloutsHealth(): Promise<void>;
//# sourceMappingURL=rollout-health.service.d.ts.map