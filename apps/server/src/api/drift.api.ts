// ============================================================================
// Drift API — drift detection status, snapshots, and alerts
// ============================================================================

import type { Request, Response } from "express";
import { DriftSnapshotRepo, DriftAlertRepo } from "@ava/db";
import { getDriftStatus, runDriftCheck } from "../jobs/drift-detector.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

/**
 * GET /api/drift/status — Current drift health summary
 */
export async function getStatus(req: Request, res: Response) {
  try {
    const { siteUrl } = req.query as Record<string, string>;
    const status = await getDriftStatus(siteUrl || null);
    res.json(status);
  } catch (error) {
    log.error("[Drift API] getStatus error:", error);
    res.status(500).json({ error: "Failed to get drift status" });
  }
}

/**
 * GET /api/drift/snapshots — Paginated snapshots
 */
export async function listSnapshots(req: Request, res: Response) {
  try {
    const {
      siteUrl,
      windowType,
      since,
      until,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const snapshots = await DriftSnapshotRepo.listSnapshots({
      siteUrl: siteUrl || undefined,
      windowType: windowType || undefined,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({ snapshots, count: snapshots.length });
  } catch (error) {
    log.error("[Drift API] listSnapshots error:", error);
    res.status(500).json({ error: "Failed to list snapshots" });
  }
}

/**
 * GET /api/drift/alerts — Paginated alerts
 */
export async function listAlerts(req: Request, res: Response) {
  try {
    const {
      siteUrl,
      alertType,
      severity,
      acknowledged,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const alerts = await DriftAlertRepo.listAlerts({
      siteUrl: siteUrl || undefined,
      alertType: alertType || undefined,
      severity: severity || undefined,
      acknowledged:
        acknowledged !== undefined
          ? acknowledged === "true"
          : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({ alerts, count: alerts.length });
  } catch (error) {
    log.error("[Drift API] listAlerts error:", error);
    res.status(500).json({ error: "Failed to list alerts" });
  }
}

/**
 * POST /api/drift/alerts/:id/ack — Acknowledge an alert
 */
export async function acknowledgeAlert(req: Request, res: Response) {
  try {
    const alert = await DriftAlertRepo.acknowledgeAlert(String(req.params.id));
    res.json(alert);
  } catch (error) {
    log.error("[Drift API] acknowledgeAlert error:", error);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
}

/**
 * POST /api/drift/check — Trigger on-demand drift check
 */
export async function triggerDriftCheck(req: Request, res: Response) {
  try {
    const { siteUrl } = req.body as { siteUrl?: string };
    const result = await runDriftCheck(siteUrl || null);
    res.json(result);
  } catch (error) {
    log.error("[Drift API] triggerDriftCheck error:", error);
    res.status(500).json({ error: "Failed to run drift check" });
  }
}
