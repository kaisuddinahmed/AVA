// ============================================================================
// Rollout Health Service — evaluates rollout health and auto-promotes/rolls back.
// Called by the nightly batch and the 4-hour canary check.
// ============================================================================

import { RolloutRepo, ExperimentRepo } from "@ava/db";
import type {
  RolloutStage,
  RolloutHealthCriteria,
  ExperimentVariant,
  HealthCheckResult,
  HealthCheckEntry,
} from "@ava/shared";
import { computeVariantMetrics } from "../experiment/experiment-metrics.js";
import {

  promoteStage,
  rollbackRollout,
} from "./rollout.service.js";

import { logger } from "../logger.js";
const log = logger.child({ service: "rollout" });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the health of a single rollout's current stage.
 */
export async function evaluateRolloutHealth(
  rolloutId: string,
): Promise<HealthCheckResult> {
  const rollout = await RolloutRepo.getRollout(rolloutId);
  if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);

  const stages = JSON.parse(rollout.stages) as RolloutStage[];
  const currentStage = stages[rollout.currentStage];
  if (!currentStage) {
    return {
      status: "healthy",
      checks: [],
      recommendation: "promote",
    };
  }

  const healthCriteria: RolloutHealthCriteria = {
    ...JSON.parse(rollout.healthCriteria),
    ...currentStage.healthChecks,
  };

  // Get treatment variant metrics from the linked experiment
  if (!rollout.experimentId) {
    return {
      status: "healthy",
      checks: [],
      recommendation: "hold",
    };
  }

  const experiment = await ExperimentRepo.getExperiment(rollout.experimentId);
  if (!experiment) {
    return {
      status: "degraded",
      checks: [],
      recommendation: "hold",
    };
  }

  const variants = JSON.parse(experiment.variants) as ExperimentVariant[];
  const metrics = await computeVariantMetrics(rollout.experimentId, variants);

  const treatment = metrics.find((m) => m.variantId === "treatment");
  if (!treatment) {
    return {
      status: "degraded",
      checks: [
        {
          name: "treatment_data",
          passed: false,
          expected: 1,
          actual: 0,
        },
      ],
      recommendation: "hold",
    };
  }

  // Run health checks
  const checks: HealthCheckEntry[] = [];
  let hasCriticalFailure = false;

  // Check: minimum sample size
  if (healthCriteria.minSampleSize != null) {
    const passed = treatment.sampleSize >= healthCriteria.minSampleSize;
    checks.push({
      name: "min_sample_size",
      passed,
      expected: healthCriteria.minSampleSize,
      actual: treatment.sampleSize,
    });
    if (!passed) {
      // Insufficient data — hold, don't rollback
    }
  }

  // Check: minimum conversion rate
  if (healthCriteria.minConversionRate != null) {
    const passed =
      treatment.conversionRate >= healthCriteria.minConversionRate;
    checks.push({
      name: "min_conversion_rate",
      passed,
      expected: healthCriteria.minConversionRate,
      actual: treatment.conversionRate,
    });
    // Critical failure if conversion drops below 50% of minimum
    if (
      treatment.sampleSize >= (healthCriteria.minSampleSize ?? 10) &&
      treatment.conversionRate < healthCriteria.minConversionRate * 0.5
    ) {
      hasCriticalFailure = true;
    }
  }

  // Check: maximum dismissal rate
  if (healthCriteria.maxDismissalRate != null) {
    const passed =
      treatment.dismissalRate <= healthCriteria.maxDismissalRate;
    checks.push({
      name: "max_dismissal_rate",
      passed,
      expected: healthCriteria.maxDismissalRate,
      actual: treatment.dismissalRate,
    });
    // Critical failure if dismissal exceeds 150% of max
    if (
      treatment.sampleSize >= (healthCriteria.minSampleSize ?? 10) &&
      treatment.dismissalRate > healthCriteria.maxDismissalRate * 1.5
    ) {
      hasCriticalFailure = true;
    }
  }

  // Determine overall status and recommendation
  const allPassed = checks.every((c) => c.passed);
  const hasInsufficientData = checks.some(
    (c) => c.name === "min_sample_size" && !c.passed,
  );

  let status: "healthy" | "degraded" | "unhealthy";
  let recommendation: "promote" | "hold" | "rollback";

  if (hasCriticalFailure) {
    status = "unhealthy";
    recommendation = "rollback";
  } else if (hasInsufficientData) {
    status = "degraded";
    recommendation = "hold";
  } else if (allPassed) {
    status = "healthy";
    recommendation = "promote";
  } else {
    status = "degraded";
    recommendation = "hold";
  }

  return { status, checks, recommendation };
}

/**
 * Check all active rollouts, auto-promote or rollback.
 * Called by the nightly batch and canary check timer.
 */
export async function checkAllRolloutsHealth(): Promise<void> {
  const activeRollouts = await RolloutRepo.listRollouts({
    status: "rolling",
  });

  for (const rollout of activeRollouts) {
    try {
      const health = await evaluateRolloutHealth(rollout.id);

      // Update health status on rollout record
      await RolloutRepo.updateRollout(rollout.id, {
        lastHealthCheck: new Date(),
        lastHealthStatus: health.status,
      });

      if (health.recommendation === "rollback") {
        const failedChecks = health.checks
          .filter((c) => !c.passed)
          .map((c) => c.name);
        await rollbackRollout(
          rollout.id,
          `Auto-rollback: ${failedChecks.join(", ")}`,
        );
        log.info(
          `[RolloutHealth] Auto-rolled back rollout ${rollout.name}: ${failedChecks.join(", ")}`,
        );
      } else if (health.recommendation === "promote") {
        // Check if observation period has elapsed
        const stages = JSON.parse(rollout.stages) as RolloutStage[];
        const currentStage = stages[rollout.currentStage];
        if (currentStage) {
          const hoursInStage = getHoursInCurrentStage(rollout);
          if (hoursInStage >= currentStage.durationHours) {
            await promoteStage(rollout.id);
            log.info(
              `[RolloutHealth] Auto-promoted rollout ${rollout.name} to stage ${rollout.currentStage + 1}`,
            );
          }
        }
      }
    } catch (error) {
      log.error(
        `[RolloutHealth] Failed to check rollout ${rollout.id}:`,
        error,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHoursInCurrentStage(rollout: {
  startedAt: Date | null;
  lastHealthCheck: Date | null;
  currentStage: number;
  stages: string;
}): number {
  // Calculate when the current stage started
  // For stage 0, it's when the rollout started
  // For later stages, approximate by looking at stage durations
  const stages = JSON.parse(rollout.stages) as RolloutStage[];
  const startedAt = rollout.startedAt ?? new Date();

  let stageStartTime = startedAt.getTime();
  for (let i = 0; i < rollout.currentStage; i++) {
    stageStartTime += (stages[i]?.durationHours ?? 0) * 60 * 60 * 1000;
  }

  const now = Date.now();
  return (now - stageStartTime) / (60 * 60 * 1000);
}
