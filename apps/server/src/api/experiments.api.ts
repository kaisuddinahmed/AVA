// ============================================================================
// Experiments API — A/B test CRUD and results
// ============================================================================

import type { Request, Response } from "express";
import {
  createExperiment,
  startExperiment,
  pauseExperiment,
  endExperiment,
  getExperiment,
  getResults,
  listExperiments,
} from "../experiment/experiment.service.js";

/**
 * GET /api/experiments — List experiments
 */
export async function list(req: Request, res: Response) {
  try {
    const { status, siteUrl, limit = "50", offset = "0" } =
      req.query as Record<string, string>;

    const experiments = await listExperiments({
      status: status || undefined,
      siteUrl: siteUrl || undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({ experiments, count: experiments.length });
  } catch (error) {
    console.error("[Experiments API] list error:", error);
    res.status(500).json({ error: "Failed to list experiments" });
  }
}

/**
 * POST /api/experiments — Create experiment
 */
export async function create(req: Request, res: Response) {
  try {
    const experiment = await createExperiment(req.body);
    res.status(201).json(experiment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Experiments API] create error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * GET /api/experiments/:id — Get experiment details
 */
export async function get(req: Request, res: Response) {
  try {
    const experiment = await getExperiment(String(req.params.id));
    if (!experiment) {
      return res.status(404).json({ error: "Experiment not found" });
    }
    res.json(experiment);
  } catch (error) {
    console.error("[Experiments API] get error:", error);
    res.status(500).json({ error: "Failed to get experiment" });
  }
}

/**
 * POST /api/experiments/:id/start — Start experiment
 */
export async function start(req: Request, res: Response) {
  try {
    const experiment = await startExperiment(String(req.params.id));
    res.json(experiment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Experiments API] start error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/experiments/:id/pause — Pause experiment
 */
export async function pause(req: Request, res: Response) {
  try {
    const experiment = await pauseExperiment(String(req.params.id));
    res.json(experiment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Experiments API] pause error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/experiments/:id/end — End experiment
 */
export async function end(req: Request, res: Response) {
  try {
    const experiment = await endExperiment(String(req.params.id));
    res.json(experiment);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Experiments API] end error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * GET /api/experiments/:id/results — Get metrics + significance test
 */
export async function results(req: Request, res: Response) {
  try {
    const result = await getResults(String(req.params.id));
    res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Experiments API] results error:", msg);
    res.status(400).json({ error: msg });
  }
}
