// ============================================================================
// Experiment Resolver — hooks into the evaluate pipeline to resolve
// experiment overrides for a session before MSWIM runs.
// ============================================================================

import { ExperimentRepo } from "@ava/db";
import { config } from "../config.js";
import { assignVariant } from "./experiment-assigner.js";
import type { ExperimentVariant, ExperimentOverrides } from "@ava/shared";
import { logger } from "../logger.js";

const log = logger.child({ service: "experiment" });

/**
 * Resolve experiment overrides for a session. Called before the evaluation
 * pipeline selects an engine or loads MSWIM config.
 *
 * Flow:
 * 1. Check if experiments are enabled
 * 2. Find active experiment for the session's site
 * 3. Check if session already has an assignment
 * 4. If not, deterministically assign and persist
 * 5. Return variant overrides (evalEngine, scoringConfigId)
 *
 * @param sessionId  The session being evaluated
 * @param siteUrl    The site URL (for site-scoped experiments)
 * @returns Overrides to apply, or null if no experiment applies
 */
export async function resolveExperimentOverrides(
  sessionId: string,
  siteUrl?: string,
): Promise<ExperimentOverrides | null> {
  // Check feature flag
  if (!config.experiments.enabled) {
    return null;
  }

  try {
    // Find active experiment for this site
    const experiment = await ExperimentRepo.getActiveExperiment(siteUrl);
    if (!experiment) return null;

    const variants = JSON.parse(experiment.variants) as ExperimentVariant[];
    if (variants.length === 0) return null;

    // Check for existing assignment
    let assignment = await ExperimentRepo.getSessionAssignment(
      experiment.id,
      sessionId,
    );

    if (!assignment) {
      // Deterministically assign
      const { enrolled, variantId } = assignVariant(
        sessionId,
        experiment.id,
        variants,
        experiment.trafficPercent,
      );

      if (!enrolled || !variantId) return null;

      // Persist assignment
      assignment = await ExperimentRepo.assignSession(
        experiment.id,
        sessionId,
        variantId,
      );
    }

    // Find the variant config
    const variant = variants.find((v) => v.id === assignment!.variantId);
    if (!variant) return null;

    return {
      experimentId: experiment.id,
      variantId: variant.id,
      evalEngine: variant.evalEngine,
      scoringConfigId: variant.scoringConfigId,
      modelId: variant.modelId,
    };
  } catch (error) {
    // Experiment resolution must never crash the evaluation pipeline
    log.error("[ExperimentResolver] Failed (non-blocking):", error);
    return null;
  }
}
