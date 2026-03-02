import type { Request, Response } from "express";
import { ScoringConfigRepo } from "@ava/db";
import { invalidateConfigCache } from "../evaluate/mswim/config-loader.js";
import {
  ScoringConfigCreateSchema,
  ScoringConfigUpdateSchema,
} from "../validation/schemas.js";

export async function listConfigs(_req: Request, res: Response) {
  try {
    const configs = await ScoringConfigRepo.listScoringConfigs();
    res.json({ configs });
  } catch (error) {
    console.error("[API] List scoring configs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.getScoringConfig(String(req.params.id));
    if (!config) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json({ config });
  } catch (error) {
    console.error("[API] Get scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createConfig(req: Request, res: Response) {
  try {
    const parsed = ScoringConfigCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }
    const { siteUrl, gatesJson, wIntent, wFriction, wClarity, wReceptivity, wValue, tMonitor, tPassive, tNudge, tActive, ...rest } = parsed.data;
    const config = await ScoringConfigRepo.createScoringConfig({
      ...rest,
      siteUrl: siteUrl ?? undefined,
      weightIntent: wIntent,
      weightFriction: wFriction,
      weightClarity: wClarity,
      weightReceptivity: wReceptivity,
      weightValue: wValue,
      thresholdMonitor: tMonitor,
      thresholdPassive: tPassive,
      thresholdNudge: tNudge,
      thresholdActive: tActive,
    });
    res.status(201).json({ config });
  } catch (error) {
    console.error("[API] Create scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateConfig(req: Request, res: Response) {
  try {
    const parsed = ScoringConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }
    const { siteUrl, gatesJson, wIntent, wFriction, wClarity, wReceptivity, wValue, tMonitor, tPassive, tNudge, tActive, ...updateRest } = parsed.data;
    const config = await ScoringConfigRepo.updateScoringConfig(
      String(req.params.id),
      {
        ...updateRest,
        ...(siteUrl !== undefined ? { siteUrl: siteUrl ?? undefined } : {}),
        ...(wIntent !== undefined ? { weightIntent: wIntent } : {}),
        ...(wFriction !== undefined ? { weightFriction: wFriction } : {}),
        ...(wClarity !== undefined ? { weightClarity: wClarity } : {}),
        ...(wReceptivity !== undefined ? { weightReceptivity: wReceptivity } : {}),
        ...(wValue !== undefined ? { weightValue: wValue } : {}),
        ...(tMonitor !== undefined ? { thresholdMonitor: tMonitor } : {}),
        ...(tPassive !== undefined ? { thresholdPassive: tPassive } : {}),
        ...(tNudge !== undefined ? { thresholdNudge: tNudge } : {}),
        ...(tActive !== undefined ? { thresholdActive: tActive } : {}),
      },
    );
    invalidateConfigCache();
    res.json({ config });
  } catch (error) {
    console.error("[API] Update scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function activateConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.activateConfig(String(req.params.id));
    invalidateConfigCache();
    res.json({ config });
  } catch (error) {
    console.error("[API] Activate scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteConfig(req: Request, res: Response) {
  try {
    await ScoringConfigRepo.deleteScoringConfig(String(req.params.id));
    invalidateConfigCache();
    res.json({ ok: true });
  } catch (error) {
    console.error("[API] Delete scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
