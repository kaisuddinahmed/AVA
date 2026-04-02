// ============================================================================
// Training Data API — export endpoints for LLM fine-tuning data
// ============================================================================
import { exportAsJsonl, exportAsCsv, exportAsRecords, getExportStats, } from "../training/training-export.service.js";
import { formatAsFineTuningJsonl, formatAsExamples, } from "../training/training-formatter.service.js";
import { assessQuality, getQualityStats, } from "../training/training-quality.service.js";
import { TrainingDatapointRepo, InterventionFeedbackRepo, RetrainTriggerRepo } from "@ava/db";
import { submitFineTuneJob, getFineTuneJobStatus } from "../training/fine-tune-submit.service.js";
import { checkRetrainTriggers } from "../training/retrain-trigger.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
/**
 * Parse common query params into ExportFilters.
 */
function parseFilters(query) {
    return {
        outcome: query.outcome,
        tier: query.tier,
        siteUrl: query.siteUrl,
        frictionId: query.frictionId,
        interventionType: query.interventionType,
        since: query.since,
        until: query.until,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
    };
}
// ---------------------------------------------------------------------------
// GET /api/training/stats
// Summary statistics for the training dataset.
// ---------------------------------------------------------------------------
export async function getStats(req, res) {
    try {
        const filters = parseFilters(req.query);
        const stats = await getExportStats(filters);
        res.json(stats);
    }
    catch (error) {
        log.error("[Training API] Stats error:", error);
        res.status(500).json({ error: "Failed to compute training stats" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/export/jsonl
// Download training data as JSONL (one JSON per line).
// ---------------------------------------------------------------------------
export async function exportJsonl(req, res) {
    try {
        const filters = parseFilters(req.query);
        const jsonl = await exportAsJsonl(filters);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Disposition", `attachment; filename="ava-training-${timestamp}.jsonl"`);
        res.send(jsonl);
    }
    catch (error) {
        log.error("[Training API] JSONL export error:", error);
        res.status(500).json({ error: "Failed to export training data" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/export/csv
// Download training data as CSV (flattened).
// ---------------------------------------------------------------------------
export async function exportCsv(req, res) {
    try {
        const filters = parseFilters(req.query);
        const csv = await exportAsCsv(filters);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="ava-training-${timestamp}.csv"`);
        res.send(csv);
    }
    catch (error) {
        log.error("[Training API] CSV export error:", error);
        res.status(500).json({ error: "Failed to export training data" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/export/json
// Return training data as JSON array (for programmatic access).
// ---------------------------------------------------------------------------
export async function exportJson(req, res) {
    try {
        const filters = parseFilters(req.query);
        const records = await exportAsRecords(filters);
        res.json({
            count: records.length,
            filters,
            data: records,
        });
    }
    catch (error) {
        log.error("[Training API] JSON export error:", error);
        res.status(500).json({ error: "Failed to export training data" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/export/fine-tune
// Download training data as chat fine-tuning JSONL (system/user/assistant).
// Query params: all ExportFilters + preset, minEventCount, includeOutcomes,
//   minClarityScore, includeOutcomeHint, maxExamples.
// ---------------------------------------------------------------------------
export async function exportFineTune(req, res) {
    try {
        const filters = parseFilters(req.query);
        const options = parseFormatterOptions(req.query);
        const { jsonl, stats } = await formatAsFineTuningJsonl(filters, options);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const preset = options.preset ?? "generic";
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Disposition", `attachment; filename="ava-finetune-${preset}-${timestamp}.jsonl"`);
        res.setHeader("X-Formatter-Stats", JSON.stringify(stats));
        res.send(jsonl);
    }
    catch (error) {
        log.error("[Training API] Fine-tune export error:", error);
        res.status(500).json({ error: "Failed to export fine-tuning data" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/export/fine-tune/preview
// Preview formatted examples as JSON (with stats, no file download).
// ---------------------------------------------------------------------------
export async function previewFineTune(req, res) {
    try {
        const filters = parseFilters(req.query);
        const options = parseFormatterOptions(req.query);
        // Cap preview to 5 examples by default
        if (!options.maxExamples)
            options.maxExamples = 5;
        const { examples, stats } = await formatAsExamples(filters, options);
        res.json({ stats, examples });
    }
    catch (error) {
        log.error("[Training API] Fine-tune preview error:", error);
        res.status(500).json({ error: "Failed to preview fine-tuning data" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/quality/stats
// Quality filter summary stats (grade distribution, rejection reasons).
// ---------------------------------------------------------------------------
export async function getQuality(req, res) {
    try {
        const filters = parseFilters(req.query);
        const thresholds = parseQualityThresholds(req.query);
        const stats = await getQualityStats(filters, thresholds);
        res.json(stats);
    }
    catch (error) {
        log.error("[Training API] Quality stats error:", error);
        res.status(500).json({ error: "Failed to compute quality stats" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/quality/assess
// Full per-datapoint quality assessment with grades and check results.
// ---------------------------------------------------------------------------
export async function assessDatapoints(req, res) {
    try {
        const filters = parseFilters(req.query);
        const thresholds = parseQualityThresholds(req.query);
        const minGrade = req.query.minGrade || undefined;
        const { assessments, stats } = await assessQuality(filters, thresholds);
        // Optionally filter by min grade
        const gradeRank = {
            high: 3,
            medium: 2,
            low: 1,
            rejected: 0,
        };
        const filtered = minGrade
            ? assessments.filter((a) => gradeRank[a.grade] >= (gradeRank[minGrade] ?? 0))
            : assessments;
        res.json({
            stats,
            count: filtered.length,
            assessments: filtered,
        });
    }
    catch (error) {
        log.error("[Training API] Quality assess error:", error);
        res.status(500).json({ error: "Failed to assess datapoint quality" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/distribution
// Tier × outcome cross-tab for model analysis.
// ---------------------------------------------------------------------------
export async function getDistribution(req, res) {
    try {
        const siteUrl = req.query.siteUrl;
        const [outcomeDistribution, crossTab] = await Promise.all([
            TrainingDatapointRepo.getOutcomeDistribution(siteUrl),
            TrainingDatapointRepo.getTierOutcomeCrossTab(siteUrl),
        ]);
        res.json({ outcomeDistribution, tierOutcomeCrossTab: crossTab });
    }
    catch (error) {
        log.error("[Training API] Distribution error:", error);
        res.status(500).json({ error: "Failed to compute distribution" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/feedback/stats
// Aggregated feedback stats (helpful vs not_helpful counts).
// ---------------------------------------------------------------------------
export async function getFeedbackStats(_req, res) {
    try {
        const stats = await InterventionFeedbackRepo.getFeedbackStats();
        res.json(stats);
    }
    catch (error) {
        log.error("[Training API] Feedback stats error:", error);
        res.status(500).json({ error: "Failed to compute feedback stats" });
    }
}
// ---------------------------------------------------------------------------
// POST /api/training/fine-tune/submit
// Submit training data to a provider for fine-tuning.
// ---------------------------------------------------------------------------
export async function submitFineTune(req, res) {
    try {
        const { baseModel, preset, maxExamples, siteUrl } = req.body;
        const provider = "groq";
        const result = await submitFineTuneJob({ provider, baseModel, preset, maxExamples, siteUrl });
        res.status(201).json(result);
    }
    catch (error) {
        log.error("[Training API] Fine-tune submit error:", error);
        res.status(500).json({ error: error.message || "Failed to submit fine-tune job" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/fine-tune/status/:jobId
// Poll provider for fine-tune job status.
// ---------------------------------------------------------------------------
export async function getFineTuneStatus(req, res) {
    try {
        const provider = "groq";
        const status = await getFineTuneJobStatus(provider, req.params.jobId);
        res.json(status);
    }
    catch (error) {
        log.error("[Training API] Fine-tune status error:", error);
        res.status(500).json({ error: "Failed to get fine-tune status" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/training/retrain/history
// List retrain trigger history.
// ---------------------------------------------------------------------------
export async function getRetrainHistory(req, res) {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const triggers = await RetrainTriggerRepo.listTriggers({ limit });
        res.json({ count: triggers.length, triggers });
    }
    catch (error) {
        log.error("[Training API] Retrain history error:", error);
        res.status(500).json({ error: "Failed to list retrain history" });
    }
}
// ---------------------------------------------------------------------------
// POST /api/training/retrain/trigger
// Manually trigger a retrain check.
// ---------------------------------------------------------------------------
export async function triggerRetrain(_req, res) {
    try {
        const result = await checkRetrainTriggers();
        res.json(result);
    }
    catch (error) {
        log.error("[Training API] Manual retrain error:", error);
        res.status(500).json({ error: "Failed to trigger retrain" });
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_PRESETS = new Set(["groq", "generic"]);
function parseFormatterOptions(query) {
    const opts = {};
    if (query.preset && VALID_PRESETS.has(query.preset)) {
        opts.preset = query.preset;
    }
    if (query.minEventCount) {
        opts.minEventCount = Number(query.minEventCount);
    }
    if (query.includeOutcomes) {
        opts.includeOutcomes = query.includeOutcomes.split(",");
    }
    if (query.minClarityScore) {
        opts.minClarityScore = Number(query.minClarityScore);
    }
    if (query.includeOutcomeHint === "true") {
        opts.includeOutcomeHint = true;
    }
    if (query.maxExamples) {
        opts.maxExamples = Number(query.maxExamples);
    }
    return opts;
}
function parseQualityThresholds(query) {
    const t = {};
    if (query.minEventCount)
        t.minEventCount = Number(query.minEventCount);
    if (query.maxEventCount)
        t.maxEventCount = Number(query.maxEventCount);
    if (query.minSessionAgeSec)
        t.minSessionAgeSec = Number(query.minSessionAgeSec);
    if (query.maxSessionAgeSec)
        t.maxSessionAgeSec = Number(query.maxSessionAgeSec);
    if (query.minNarrativeLength)
        t.minNarrativeLength = Number(query.minNarrativeLength);
    if (query.minClarityScore)
        t.minClarityScore = Number(query.minClarityScore);
    if (query.maxOutcomeDelayMs)
        t.maxOutcomeDelayMs = Number(query.maxOutcomeDelayMs);
    if (query.minCompositeScore)
        t.minCompositeScore = Number(query.minCompositeScore);
    if (query.requireFriction === "true")
        t.requireFriction = true;
    if (query.validOutcomes)
        t.validOutcomes = query.validOutcomes.split(",");
    return t;
}
//# sourceMappingURL=training.api.js.map