// ============================================================================
// Rollouts API — staged config change management
// ============================================================================

import type { Request, Response } from "express";
import {
  createRollout,
  startRollout,
  promoteStage,
  rollbackRollout,
  pauseRollout,
  listRollouts,
  getRollout,
} from "../rollout/rollout.service.js";
import { evaluateRolloutHealth } from "../rollout/rollout-health.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

/**
 * GET /api/rollouts — List rollouts
 */
export async function list(req: Request, res: Response) {
  try {
    const { status, siteUrl, limit = "50", offset = "0" } =
      req.query as Record<string, string>;

    const rollouts = await listRollouts({
      status: status || undefined,
      siteUrl: siteUrl || undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({ rollouts, count: rollouts.length });
  } catch (error) {
    log.error("[Rollouts API] list error:", error);
    res.status(500).json({ error: "Failed to list rollouts" });
  }
}

/**
 * POST /api/rollouts — Create rollout
 */
export async function create(req: Request, res: Response) {
  try {
    const rollout = await createRollout(req.body);
    res.status(201).json(rollout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("[Rollouts API] create error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * GET /api/rollouts/:id — Get rollout details + health status
 */
export async function get(req: Request, res: Response) {
  try {
    const rollout = await getRollout(String(req.params.id));
    if (!rollout) {
      return res.status(404).json({ error: "Rollout not found" });
    }

    // Include health status if rolling
    let health = null;
    if (rollout.status === "rolling") {
      try {
        health = await evaluateRolloutHealth(String(req.params.id));
      } catch {
        // Health check may fail if no data yet
      }
    }

    res.json({ ...rollout, health });
  } catch (error) {
    log.error("[Rollouts API] get error:", error);
    res.status(500).json({ error: "Failed to get rollout" });
  }
}

/**
 * POST /api/rollouts/:id/start — Start rollout
 */
export async function start(req: Request, res: Response) {
  try {
    const rollout = await startRollout(String(req.params.id));
    res.json(rollout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("[Rollouts API] start error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/rollouts/:id/promote — Manual promote to next stage
 */
export async function promote(req: Request, res: Response) {
  try {
    const rollout = await promoteStage(String(req.params.id));
    res.json(rollout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("[Rollouts API] promote error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/rollouts/:id/rollback — Manual rollback
 */
export async function rollback(req: Request, res: Response) {
  try {
    const { reason = "Manual rollback" } = req.body as { reason?: string };
    const rollout = await rollbackRollout(String(req.params.id), reason);
    res.json(rollout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("[Rollouts API] rollback error:", msg);
    res.status(400).json({ error: msg });
  }
}

/**
 * POST /api/rollouts/:id/pause — Pause rollout
 */
export async function pauseRolloutEndpoint(req: Request, res: Response) {
  try {
    const rollout = await pauseRollout(String(req.params.id));
    res.json(rollout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("[Rollouts API] pause error:", msg);
    res.status(400).json({ error: msg });
  }
}
