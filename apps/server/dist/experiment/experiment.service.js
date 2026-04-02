// ============================================================================
// Experiment Service — A/B test lifecycle management
// ============================================================================
import { ExperimentRepo } from "@ava/db";
import { getExperimentResults } from "./experiment-metrics.js";
// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
/**
 * Create a new experiment in draft status.
 */
export async function createExperiment(input) {
    // Validate variant weights sum to ~1.0
    const weightSum = input.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
        throw new Error(`Variant weights must sum to 1.0 (got ${weightSum.toFixed(4)})`);
    }
    // Ensure at least 2 variants
    if (input.variants.length < 2) {
        throw new Error("Experiment requires at least 2 variants");
    }
    return ExperimentRepo.createExperiment({
        name: input.name,
        description: input.description,
        siteUrl: input.siteUrl,
        trafficPercent: input.trafficPercent ?? 100,
        variants: JSON.stringify(input.variants),
        primaryMetric: input.primaryMetric ?? "conversion_rate",
        minSampleSize: input.minSampleSize ?? 100,
    });
}
/**
 * Start an experiment (draft → running).
 */
export async function startExperiment(id) {
    const experiment = await ExperimentRepo.getExperiment(id);
    if (!experiment)
        throw new Error(`Experiment ${id} not found`);
    if (experiment.status !== "draft" && experiment.status !== "paused") {
        throw new Error(`Cannot start experiment in ${experiment.status} status`);
    }
    // Check for conflicting active experiments on the same site
    const active = await ExperimentRepo.getActiveExperiment(experiment.siteUrl ?? undefined);
    if (active && active.id !== id) {
        throw new Error(`Another experiment (${active.name}) is already running for this site`);
    }
    return ExperimentRepo.startExperiment(id);
}
/**
 * Pause a running experiment.
 */
export async function pauseExperiment(id) {
    const experiment = await ExperimentRepo.getExperiment(id);
    if (!experiment)
        throw new Error(`Experiment ${id} not found`);
    if (experiment.status !== "running") {
        throw new Error(`Cannot pause experiment in ${experiment.status} status`);
    }
    return ExperimentRepo.updateExperiment(id, { status: "paused" });
}
/**
 * End an experiment (running → completed).
 */
export async function endExperiment(id) {
    const experiment = await ExperimentRepo.getExperiment(id);
    if (!experiment)
        throw new Error(`Experiment ${id} not found`);
    if (experiment.status !== "running" &&
        experiment.status !== "paused") {
        throw new Error(`Cannot end experiment in ${experiment.status} status`);
    }
    return ExperimentRepo.endExperiment(id);
}
/**
 * Get experiment details with parsed variants.
 */
export async function getExperiment(id) {
    const experiment = await ExperimentRepo.getExperiment(id);
    if (!experiment)
        return null;
    return {
        ...experiment,
        parsedVariants: JSON.parse(experiment.variants),
    };
}
/**
 * Get experiment results with metrics and significance testing.
 */
export async function getResults(id) {
    const experiment = await ExperimentRepo.getExperiment(id);
    if (!experiment)
        throw new Error(`Experiment ${id} not found`);
    const variants = JSON.parse(experiment.variants);
    return getExperimentResults(id, variants);
}
/**
 * List experiments with optional filters.
 */
export async function listExperiments(options) {
    return ExperimentRepo.listExperiments(options);
}
//# sourceMappingURL=experiment.service.js.map