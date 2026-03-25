// ============================================================================
// Insights API — merchant digest + CRO recommendations
// ============================================================================

import type { Request, Response } from "express";
import { InsightSnapshotRepo } from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

function parseSiteUrl(req: Request): string | undefined {
  return req.query.siteUrl as string | undefined;
}

/**
 * GET /api/insights/latest?siteUrl=
 * Returns the most recent InsightSnapshot for a site (weekly digest + AI recs).
 */
export async function getLatestInsights(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) {
      res.status(400).json({ error: "siteUrl is required" });
      return;
    }

    const snapshot = await InsightSnapshotRepo.getLatestInsightSnapshot(siteUrl);
    if (!snapshot) {
      res.json({
        siteUrl,
        snapshot: null,
        message: "No insight snapshot yet — will be generated on next nightly batch run.",
      });
      return;
    }

    let recommendations: unknown[] = [];
    try { recommendations = JSON.parse(snapshot.recommendations); } catch { /* ignore */ }

    let topFrictionTypes: string[] = [];
    try { topFrictionTypes = JSON.parse(snapshot.topFrictionTypes); } catch { /* ignore */ }

    res.json({
      siteUrl,
      snapshot: {
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        sessionsAnalyzed: snapshot.sessionsAnalyzed,
        frictionsCaught: snapshot.frictionsCaught,
        attributedRevenue: snapshot.attributedRevenue,
        topFrictionTypes,
        wowDeltaPct: snapshot.wowDeltaPct,
        recommendations,
      },
    });
  } catch (err) {
    log.error("[InsightsAPI] getLatestInsights error:", err);
    res.status(500).json({ error: "Failed to fetch insights" });
  }
}

/**
 * GET /api/insights/cro?siteUrl=
 * Returns the latest CRO structural findings for a site.
 */
export async function getCROFindings(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) {
      res.status(400).json({ error: "siteUrl is required" });
      return;
    }

    const snapshot = await InsightSnapshotRepo.getLatestCROFindings(siteUrl);
    if (!snapshot?.croFindings) {
      res.json({ siteUrl, findings: [], message: "No CRO findings yet." });
      return;
    }

    let findings: unknown[] = [];
    try { findings = JSON.parse(snapshot.croFindings); } catch { /* ignore */ }

    res.json({ siteUrl, generatedAt: snapshot.createdAt, findings });
  } catch (err) {
    log.error("[InsightsAPI] getCROFindings error:", err);
    res.status(500).json({ error: "Failed to fetch CRO findings" });
  }
}
