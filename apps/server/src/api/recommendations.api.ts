// ============================================================================
// Recommendations API — Phase 3.2.
//
// Surfaces the deterministic recommendation engine to the dashboard:
//
//   GET    /api/recommendations               — list (filtered)
//   GET    /api/recommendations/:id           — single + linked experiment
//   POST   /api/recommendations/:id/approve   — approve → auto-create Experiment
//   POST   /api/recommendations/:id/reject    — reject with reason
//   POST   /api/recommendations/regenerate    — on-demand regen for a site
//
// Request validation via Zod (CLAUDE.md hard rule for any structured input).
// ============================================================================

import type { Request, Response } from "express";
import { z } from "zod";
import { RecommendationRepo } from "@ava/db";
import {
  approveRecommendation,
  rejectRecommendation,
  regenerateForSite,
  getWithExperiment,
} from "../insights/recommendation.service.js";
import {
  computeOutcomeForRecommendation,
  listOutcomes,
  summaryForSite,
} from "../insights/recommendation-outcome.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "recommendations.api" });

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListQuerySchema = z.object({
  siteUrl: z.string().min(1, "siteUrl is required"),
  status: z.enum(["pending", "approved", "active", "rejected", "archived"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const ApproveBodySchema = z.object({
  trafficPercent: z.number().min(1).max(100).optional(),
  autoStart: z.boolean().optional(),
}).optional();

const RejectBodySchema = z.object({
  reason: z.string().min(1, "reason is required"),
});

const RegenerateBodySchema = z.object({
  siteUrl: z.string().min(1, "siteUrl is required"),
  windowDays: z.number().int().positive().max(90).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const SummaryQuerySchema = z.object({
  siteUrl: z.string().min(1, "siteUrl is required"),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const ComputeOutcomeBodySchema = z.object({
  persist: z.boolean().optional(),
}).optional();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/recommendations?siteUrl=…&status=…&limit=…
 *
 * Default status filter is `pending` (the approval queue).
 */
export async function list(req: Request, res: Response) {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { siteUrl, status, limit } = parsed.data;
  try {
    const recs = await RecommendationRepo.listBySite(siteUrl, {
      status: status ?? "pending",
      limit,
    });
    res.json({ recommendations: recs, count: recs.length });
  } catch (err) {
    log.error({ err: String(err) }, "[Recommendations API] list error");
    res.status(500).json({ error: "Failed to list recommendations" });
  }
}

/**
 * GET /api/recommendations/:id — single record with linked experiment.
 */
export async function get(req: Request, res: Response) {
  try {
    const result = await getWithExperiment(String(req.params.id));
    if (!result) return res.status(404).json({ error: "Recommendation not found" });
    res.json(result);
  } catch (err) {
    log.error({ err: String(err) }, "[Recommendations API] get error");
    res.status(500).json({ error: "Failed to get recommendation" });
  }
}

/**
 * POST /api/recommendations/:id/approve
 *
 * Body (optional): { trafficPercent?: number, autoStart?: boolean }
 */
export async function approve(req: Request, res: Response) {
  const body = ApproveBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }
  try {
    const rec = await approveRecommendation(String(req.params.id), body.data ?? {});
    res.json(rec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[Recommendations API] approve error");
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/recommendations/:id/reject — Body: { reason: string }
 */
export async function reject(req: Request, res: Response) {
  const body = RejectBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }
  try {
    const rec = await rejectRecommendation(String(req.params.id), body.data);
    res.json(rec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[Recommendations API] reject error");
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/recommendations/regenerate — Body: { siteUrl, windowDays?, limit? }
 *
 * Triggers an immediate recommendation pass for the site. Returns the
 * persisted rows (with `pending` status, ready for merchant review).
 */
export async function regenerate(req: Request, res: Response) {
  const body = RegenerateBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }
  try {
    const persisted = await regenerateForSite(body.data);
    res.json({ recommendations: persisted, count: persisted.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[Recommendations API] regenerate error");
    res.status(500).json({ error: msg });
  }
}

// ── Phase 3.4 — outcome endpoints ──────────────────────────────────────────

/**
 * GET /api/recommendations/outcomes/summary?siteUrl=…&limit=…
 *
 * Approved/active recommendations on the site, each with the latest
 * RecommendationOutcome (or null). Drives the dashboard "Live results" cards.
 */
export async function outcomesSummary(req: Request, res: Response) {
  const parsed = SummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const rows = await summaryForSite(parsed.data.siteUrl, parsed.data.limit ?? 50);
    res.json({ recommendations: rows, count: rows.length });
  } catch (err) {
    log.error({ err: String(err) }, "[Recommendations API] outcomesSummary error");
    res.status(500).json({ error: "Failed to load outcome summary" });
  }
}

/**
 * GET /api/recommendations/:id/outcomes — history of snapshots, newest first.
 */
export async function getOutcomes(req: Request, res: Response) {
  try {
    const rows = await listOutcomes(String(req.params.id));
    res.json({ outcomes: rows, count: rows.length });
  } catch (err) {
    log.error({ err: String(err) }, "[Recommendations API] getOutcomes error");
    res.status(500).json({ error: "Failed to list outcomes" });
  }
}

/**
 * POST /api/recommendations/:id/compute-outcome
 *
 * On-demand recomputation. Body (optional): { persist?: boolean } — defaults
 * to true so the nightly job stays the system of record.
 */
export async function computeOutcome(req: Request, res: Response) {
  const body = ComputeOutcomeBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: body.error.flatten() });
  }
  try {
    const result = await computeOutcomeForRecommendation(
      String(req.params.id),
      body.data ?? {},
    );
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[Recommendations API] computeOutcome error");
    res.status(400).json({ error: msg });
  }
}
