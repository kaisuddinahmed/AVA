// ============================================================================
// Fine-Tune Submission Service — submit training data to Groq for fine-tuning.
// Creates a ModelVersion record, exports JSONL, uploads to provider, returns job.
// ============================================================================
import { ModelVersionRepo, TrainingDatapointRepo } from "@ava/db";
import { formatAsFineTuningJsonl } from "./training-formatter.service.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "training" });
/**
 * Export training data, upload to Groq, and create a ModelVersion record.
 * Groq fine-tuning API is not yet publicly stable — JSONL is prepared and
 * the ModelVersion record is created so it's ready when the API launches.
 */
export async function submitFineTuneJob(options) {
    const { baseModel = config.groq.model, preset = "groq", maxExamples = 5000, siteUrl, } = options;
    // 1. Export and format training data as JSONL
    const filters = {
        outcome: "converted,dismissed",
        siteUrl,
        limit: maxExamples * 2,
    };
    const { jsonl, stats } = await formatAsFineTuningJsonl(filters, {
        preset,
        maxExamples,
        minClarityScore: 20,
    });
    if (stats.formatted < 10) {
        throw new Error(`Not enough training examples (${stats.formatted}). Need at least 10.`);
    }
    // 2. Count total datapoints for the record
    const totalDatapoints = await TrainingDatapointRepo.countDatapoints({ siteUrl });
    // 3. Create ModelVersion record (status: training)
    const modelVersion = await ModelVersionRepo.createModelVersion({
        provider: "groq",
        baseModel,
        modelId: "pending", // Updated when job completes
        status: "training",
        trainingDatapointCount: stats.formatted,
        qualityStats: JSON.stringify(stats),
    });
    // 4. Submit to Groq
    let fineTuneJobId = null;
    try {
        fineTuneJobId = await submitToGroq(jsonl, baseModel, modelVersion.id);
        if (fineTuneJobId) {
            await ModelVersionRepo.updateModelVersion(modelVersion.id, { fineTuneJobId });
        }
    }
    catch (err) {
        // Groq fine-tuning API not yet stable — mark as ready with base model
        log.info(`[FineTune] Groq fine-tune submission not available: ${err.message}`);
        log.info(`[FineTune] JSONL ready (${stats.formatted} examples). ModelVersion created with base model.`);
        await ModelVersionRepo.updateModelVersion(modelVersion.id, {
            status: "ready",
            modelId: baseModel,
        });
    }
    return {
        modelVersionId: modelVersion.id,
        fineTuneJobId,
        status: fineTuneJobId ? "training" : "ready",
        exampleCount: stats.formatted,
    };
}
/**
 * Submit JSONL to Groq fine-tuning API.
 * Requires GROQ_API_KEY env var.
 *
 * NOTE: Groq's fine-tuning API is not yet publicly stable. This implementation
 * uses the Groq SDK and will work once the fine-tuning endpoints are available.
 * Until then, the caller catches the error and falls back to base model.
 */
async function submitToGroq(jsonl, baseModel, modelVersionId) {
    const apiKey = config.groq.apiKey;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY is required for Groq fine-tuning");
    }
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey });
    // Upload training file via Groq API
    const file = await groq.files.create({
        file: new File([jsonl], "training.jsonl", { type: "application/jsonl" }),
        purpose: "fine-tune",
    });
    log.info(`[FineTune] Uploaded file to Groq: ${file.id} (${file.bytes} bytes)`);
    // Create fine-tuning job
    const job = await groq.fineTuning.jobs.create({
        model: baseModel,
        training_file: file.id,
        suffix: `ava-${modelVersionId.slice(0, 8)}`,
    });
    log.info(`[FineTune] Created Groq fine-tune job: ${job.id} (status: ${job.status})`);
    return job.id;
}
/**
 * Poll a Groq fine-tune job and return current status.
 */
export async function getFineTuneJobStatus(provider, jobId) {
    if (provider !== "groq") {
        return { status: "unsupported", error: `${provider} is not a supported provider. Use groq.` };
    }
    const apiKey = config.groq.apiKey;
    if (!apiKey) {
        return { status: "error", error: "GROQ_API_KEY not set" };
    }
    try {
        const Groq = (await import("groq-sdk")).default;
        const groq = new Groq({ apiKey });
        const job = await groq.fineTuning.jobs.retrieve(jobId);
        return {
            status: job.status,
            fineTunedModel: job.fine_tuned_model ?? undefined,
            error: job.error?.message,
        };
    }
    catch (err) {
        return {
            status: "error",
            error: `Failed to poll Groq fine-tune job: ${err.message}`,
        };
    }
}
//# sourceMappingURL=fine-tune-submit.service.js.map