// ============================================================================
// Model Version API — manage fine-tuned model lifecycle
// ============================================================================

import type { Request, Response } from "express";
import { ModelVersionRepo } from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

// ---------------------------------------------------------------------------
// GET /api/models
// ---------------------------------------------------------------------------
export async function list(req: Request, res: Response): Promise<void> {
  try {
    const provider = req.query.provider as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const models = await ModelVersionRepo.listModelVersions({ provider, status, limit });
    res.json({ count: models.length, models });
  } catch (error) {
    log.error("[Models API] List error:", error);
    res.status(500).json({ error: "Failed to list model versions" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/models/active
// ---------------------------------------------------------------------------
export async function getActive(req: Request, res: Response): Promise<void> {
  try {
    const provider = (req.query.provider as string) || "groq";
    const model = await ModelVersionRepo.getActiveModel(provider);
    res.json({ model });
  } catch (error) {
    log.error("[Models API] Active model error:", error);
    res.status(500).json({ error: "Failed to get active model" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/models
// ---------------------------------------------------------------------------
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { provider, baseModel, modelId, fineTuneJobId, trainingDatapointCount, qualityStats } = req.body;
    if (!provider || !baseModel || !modelId) {
      res.status(400).json({ error: "provider, baseModel, and modelId are required" });
      return;
    }
    const model = await ModelVersionRepo.createModelVersion({
      provider,
      baseModel,
      modelId,
      fineTuneJobId,
      trainingDatapointCount,
      qualityStats,
    });
    res.status(201).json({ model });
  } catch (error) {
    log.error("[Models API] Create error:", error);
    res.status(500).json({ error: "Failed to create model version" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/models/:id/promote
// ---------------------------------------------------------------------------
export async function promote(req: Request, res: Response): Promise<void> {
  try {
    const model = await ModelVersionRepo.promoteModel(req.params.id);
    res.json({ model });
  } catch (error) {
    log.error("[Models API] Promote error:", error);
    res.status(500).json({ error: "Failed to promote model" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/models/:id/retire
// ---------------------------------------------------------------------------
export async function retire(req: Request, res: Response): Promise<void> {
  try {
    const model = await ModelVersionRepo.retireModel(req.params.id);
    res.json({ model });
  } catch (error) {
    log.error("[Models API] Retire error:", error);
    res.status(500).json({ error: "Failed to retire model" });
  }
}
