// ============================================================================
// Training Data API — export endpoints for LLM fine-tuning data
// ============================================================================

import type { Request, Response } from "express";
import {
  exportAsJsonl,
  exportAsCsv,
  exportAsRecords,
  getExportStats,
  type ExportFilters,
} from "../training/training-export.service.js";
import {
  formatAsFineTuningJsonl,
  formatAsExamples,
  type FormatterOptions,
  type FormatterPreset,
} from "../training/training-formatter.service.js";
import {
  assessQuality,
  getQualityStats,
  type QualityGrade,
  type QualityThresholds,
} from "../training/training-quality.service.js";
import { TrainingDatapointRepo, InterventionFeedbackRepo, RetrainTriggerRepo } from "@ava/db";
import { submitFineTuneJob, getFineTuneJobStatus } from "../training/fine-tune-submit.service.js";
import { checkRetrainTriggers } from "../training/retrain-trigger.service.js";
import { RetrainTriggerRepo } from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

/**
 * Parse common query params into ExportFilters.
 */
function parseFilters(query: Request["query"]): ExportFilters {
  return {
    outcome: query.outcome as string | undefined,
    tier: query.tier as string | undefined,
    siteUrl: query.siteUrl as string | undefined,
    frictionId: query.frictionId as string | undefined,
    interventionType: query.interventionType as string | undefined,
    since: query.since as string | undefined,
    until: query.until as string | undefined,
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined,
  };
}

// ---------------------------------------------------------------------------
// GET /api/training/stats
// Summary statistics for the training dataset.
// ---------------------------------------------------------------------------
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const stats = await getExportStats(filters);
    res.json(stats);
  } catch (error) {
    log.error("[Training API] Stats error:", error);
    res.status(500).json({ error: "Failed to compute training stats" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/export/jsonl
// Download training data as JSONL (one JSON per line).
// ---------------------------------------------------------------------------
export async function exportJsonl(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const jsonl = await exportAsJsonl(filters);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ava-training-${timestamp}.jsonl"`
    );
    res.send(jsonl);
  } catch (error) {
    log.error("[Training API] JSONL export error:", error);
    res.status(500).json({ error: "Failed to export training data" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/export/csv
// Download training data as CSV (flattened).
// ---------------------------------------------------------------------------
export async function exportCsv(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const csv = await exportAsCsv(filters);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ava-training-${timestamp}.csv"`
    );
    res.send(csv);
  } catch (error) {
    log.error("[Training API] CSV export error:", error);
    res.status(500).json({ error: "Failed to export training data" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/export/json
// Return training data as JSON array (for programmatic access).
// ---------------------------------------------------------------------------
export async function exportJson(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const records = await exportAsRecords(filters);
    res.json({
      count: records.length,
      filters,
      data: records,
    });
  } catch (error) {
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
export async function exportFineTune(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const options = parseFormatterOptions(req.query);
    const { jsonl, stats } = await formatAsFineTuningJsonl(filters, options);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preset = options.preset ?? "generic";
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ava-finetune-${preset}-${timestamp}.jsonl"`
    );
    res.setHeader("X-Formatter-Stats", JSON.stringify(stats));
    res.send(jsonl);
  } catch (error) {
    log.error("[Training API] Fine-tune export error:", error);
    res.status(500).json({ error: "Failed to export fine-tuning data" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/export/fine-tune/preview
// Preview formatted examples as JSON (with stats, no file download).
// ---------------------------------------------------------------------------
export async function previewFineTune(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const options = parseFormatterOptions(req.query);
    // Cap preview to 5 examples by default
    if (!options.maxExamples) options.maxExamples = 5;
    const { examples, stats } = await formatAsExamples(filters, options);
    res.json({ stats, examples });
  } catch (error) {
    log.error("[Training API] Fine-tune preview error:", error);
    res.status(500).json({ error: "Failed to preview fine-tuning data" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/quality/stats
// Quality filter summary stats (grade distribution, rejection reasons).
// ---------------------------------------------------------------------------
export async function getQuality(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const thresholds = parseQualityThresholds(req.query);
    const stats = await getQualityStats(filters, thresholds);
    res.json(stats);
  } catch (error) {
    log.error("[Training API] Quality stats error:", error);
    res.status(500).json({ error: "Failed to compute quality stats" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/quality/assess
// Full per-datapoint quality assessment with grades and check results.
// ---------------------------------------------------------------------------
export async function assessDatapoints(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters = parseFilters(req.query);
    const thresholds = parseQualityThresholds(req.query);
    const minGrade = (req.query.minGrade as QualityGrade) || undefined;
    const { assessments, stats } = await assessQuality(filters, thresholds);

    // Optionally filter by min grade
    const gradeRank: Record<QualityGrade, number> = {
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
  } catch (error) {
    log.error("[Training API] Quality assess error:", error);
    res.status(500).json({ error: "Failed to assess datapoint quality" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/distribution
// Tier × outcome cross-tab for model analysis.
// ---------------------------------------------------------------------------
export async function getDistribution(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const siteUrl = req.query.siteUrl as string | undefined;
    const [outcomeDistribution, crossTab] = await Promise.all([
      TrainingDatapointRepo.getOutcomeDistribution(siteUrl),
      TrainingDatapointRepo.getTierOutcomeCrossTab(siteUrl),
    ]);
    res.json({ outcomeDistribution, tierOutcomeCrossTab: crossTab });
  } catch (error) {
    log.error("[Training API] Distribution error:", error);
    res.status(500).json({ error: "Failed to compute distribution" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/feedback/stats
// Aggregated feedback stats (helpful vs not_helpful counts).
// ---------------------------------------------------------------------------
export async function getFeedbackStats(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const stats = await InterventionFeedbackRepo.getFeedbackStats();
    res.json(stats);
  } catch (error) {
    log.error("[Training API] Feedback stats error:", error);
    res.status(500).json({ error: "Failed to compute feedback stats" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/training/fine-tune/submit
// Submit training data to a provider for fine-tuning.
// ---------------------------------------------------------------------------
export async function submitFineTune(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { baseModel, preset, maxExamples, siteUrl } = req.body;
    const provider = "groq" as const;
    const result = await submitFineTuneJob({ provider, baseModel, preset, maxExamples, siteUrl });
    res.status(201).json(result);
  } catch (error) {
    log.error("[Training API] Fine-tune submit error:", error);
    res.status(500).json({ error: (error as Error).message || "Failed to submit fine-tune job" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/fine-tune/status/:jobId
// Poll provider for fine-tune job status.
// ---------------------------------------------------------------------------
export async function getFineTuneStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const provider = "groq";
    const status = await getFineTuneJobStatus(provider, req.params.jobId);
    res.json(status);
  } catch (error) {
    log.error("[Training API] Fine-tune status error:", error);
    res.status(500).json({ error: "Failed to get fine-tune status" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/training/retrain/history
// List retrain trigger history.
// ---------------------------------------------------------------------------
export async function getRetrainHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const triggers = await RetrainTriggerRepo.listTriggers({ limit });
    res.json({ count: triggers.length, triggers });
  } catch (error) {
    log.error("[Training API] Retrain history error:", error);
    res.status(500).json({ error: "Failed to list retrain history" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/training/retrain/trigger
// Manually trigger a retrain check.
// ---------------------------------------------------------------------------
export async function triggerRetrain(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await checkRetrainTriggers();
    res.json(result);
  } catch (error) {
    log.error("[Training API] Manual retrain error:", error);
    res.status(500).json({ error: "Failed to trigger retrain" });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PRESETS = new Set(["groq", "generic"]);

function parseFormatterOptions(query: Request["query"]): FormatterOptions {
  const opts: FormatterOptions = {};

  if (query.preset && VALID_PRESETS.has(query.preset as string)) {
    opts.preset = query.preset as FormatterPreset;
  }
  if (query.minEventCount) {
    opts.minEventCount = Number(query.minEventCount);
  }
  if (query.includeOutcomes) {
    opts.includeOutcomes = (query.includeOutcomes as string).split(",");
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

function parseQualityThresholds(
  query: Request["query"]
): Partial<QualityThresholds> {
  const t: Partial<QualityThresholds> = {};

  if (query.minEventCount) t.minEventCount = Number(query.minEventCount);
  if (query.maxEventCount) t.maxEventCount = Number(query.maxEventCount);
  if (query.minSessionAgeSec) t.minSessionAgeSec = Number(query.minSessionAgeSec);
  if (query.maxSessionAgeSec) t.maxSessionAgeSec = Number(query.maxSessionAgeSec);
  if (query.minNarrativeLength)
    t.minNarrativeLength = Number(query.minNarrativeLength);
  if (query.minClarityScore) t.minClarityScore = Number(query.minClarityScore);
  if (query.maxOutcomeDelayMs)
    t.maxOutcomeDelayMs = Number(query.maxOutcomeDelayMs);
  if (query.minCompositeScore)
    t.minCompositeScore = Number(query.minCompositeScore);
  if (query.requireFriction === "true") t.requireFriction = true;
  if (query.validOutcomes)
    t.validOutcomes = (query.validOutcomes as string).split(",");

  return t;
}
