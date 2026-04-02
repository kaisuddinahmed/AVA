// ============================================================================
// Experiments API — A/B test CRUD and results
// ============================================================================
import { createExperiment, startExperiment, pauseExperiment, endExperiment, getExperiment, getResults, listExperiments, } from "../experiment/experiment.service.js";
import { ModelVersionRepo } from "@ava/db";
import { config } from "../config.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
/**
 * GET /api/experiments — List experiments
 */
export async function list(req, res) {
    try {
        const { status, siteUrl, limit = "50", offset = "0" } = req.query;
        const experiments = await listExperiments({
            status: status || undefined,
            siteUrl: siteUrl || undefined,
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json({ experiments, count: experiments.length });
    }
    catch (error) {
        log.error("[Experiments API] list error:", error);
        res.status(500).json({ error: "Failed to list experiments" });
    }
}
/**
 * POST /api/experiments — Create experiment
 */
export async function create(req, res) {
    try {
        const experiment = await createExperiment(req.body);
        res.status(201).json(experiment);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] create error:", msg);
        res.status(400).json({ error: msg });
    }
}
/**
 * GET /api/experiments/:id — Get experiment details
 */
export async function get(req, res) {
    try {
        const experiment = await getExperiment(String(req.params.id));
        if (!experiment) {
            return res.status(404).json({ error: "Experiment not found" });
        }
        res.json(experiment);
    }
    catch (error) {
        log.error("[Experiments API] get error:", error);
        res.status(500).json({ error: "Failed to get experiment" });
    }
}
/**
 * POST /api/experiments/:id/start — Start experiment
 */
export async function start(req, res) {
    try {
        const experiment = await startExperiment(String(req.params.id));
        res.json(experiment);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] start error:", msg);
        res.status(400).json({ error: msg });
    }
}
/**
 * POST /api/experiments/:id/pause — Pause experiment
 */
export async function pause(req, res) {
    try {
        const experiment = await pauseExperiment(String(req.params.id));
        res.json(experiment);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] pause error:", msg);
        res.status(400).json({ error: msg });
    }
}
/**
 * POST /api/experiments/:id/end — End experiment
 */
export async function end(req, res) {
    try {
        const experiment = await endExperiment(String(req.params.id));
        res.json(experiment);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] end error:", msg);
        res.status(400).json({ error: msg });
    }
}
/**
 * POST /api/experiments/model-test — Create a 2-variant model A/B test.
 * Control uses base model, treatment uses the specified fine-tuned model.
 * Body: { modelVersionId, siteUrl?, trafficPercent?, name? }
 */
export async function createModelTest(req, res) {
    try {
        const { modelVersionId, siteUrl, trafficPercent = 50, name } = req.body;
        if (!modelVersionId) {
            res.status(400).json({ error: "modelVersionId is required" });
            return;
        }
        const modelVersion = await ModelVersionRepo.getModelVersion(modelVersionId);
        if (!modelVersion) {
            res.status(404).json({ error: `ModelVersion ${modelVersionId} not found` });
            return;
        }
        const baseModel = config.groq.model;
        const experimentName = name || `Model Test: ${baseModel} vs ${modelVersion.modelId}`;
        const experiment = await createExperiment({
            name: experimentName,
            description: `A/B test comparing base model (${baseModel}) against fine-tuned model (${modelVersion.modelId})`,
            siteUrl: siteUrl || null,
            trafficPercent,
            variants: [
                { id: "control", name: "control", weight: 0.5 },
                { id: "treatment", name: "treatment", weight: 0.5, modelId: modelVersion.modelId },
            ],
            primaryMetric: "conversion_rate",
            minSampleSize: 100,
        });
        res.status(201).json({ experiment });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] model-test error:", msg);
        res.status(400).json({ error: msg });
    }
}
/**
 * GET /api/experiments/:id/results — Get metrics + significance test
 */
export async function results(req, res) {
    try {
        const result = await getResults(String(req.params.id));
        res.json(result);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("[Experiments API] results error:", msg);
        res.status(400).json({ error: msg });
    }
}
//# sourceMappingURL=experiments.api.js.map