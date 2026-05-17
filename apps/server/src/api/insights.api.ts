// ============================================================================
// Insights API — merchant digest + CRO recommendations
// ============================================================================

import type { Request, Response } from "express";
import { z } from "zod";
import { InsightSnapshotRepo } from "@ava/db";
import { buildWeeklyDigest } from "../insights/weekly-digest.service.js";
import { sendDigestEmail } from "../insights/digest-email.service.js";
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

// ── Phase 3.6 — Weekly digest preview ───────────────────────────────────────

const DigestQuerySchema = z.object({
  siteUrl: z.string().min(1, "siteUrl is required"),
  windowDays: z.coerce.number().int().positive().max(90).optional(),
});

/**
 * GET /api/insights/digest?siteUrl=…&windowDays=…
 *
 * On-demand compose of the Phase 3 weekly digest. Pure read; no persistence
 * (Phase 3.7 will own snapshotting + email delivery). The dashboard's Digest
 * preview panel calls this; the future digest email reuses the same shape.
 */
export async function getWeeklyDigest(req: Request, res: Response): Promise<void> {
  const parsed = DigestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const digest = await buildWeeklyDigest(parsed.data.siteUrl, {
      windowDays: parsed.data.windowDays,
    });
    res.json(digest);
  } catch (err) {
    log.error({ err: String(err) }, "[InsightsAPI] getWeeklyDigest error");
    res.status(500).json({ error: "Failed to build digest" });
  }
}

// ── Phase 3.7 — email delivery ──────────────────────────────────────────────

const SendDigestBodySchema = z.object({
  siteUrl: z.string().min(1, "siteUrl is required"),
  recipient: z.string().email("recipient must be a valid email").optional(),
  windowDays: z.number().int().positive().max(90).optional(),
});

/**
 * POST /api/insights/digest/send
 * Body: { siteUrl, recipient?, windowDays? }
 *
 * Builds the weekly digest, renders the email, and dispatches via the
 * configured provider (EMAIL_PROVIDER env). Returns the rendered subject +
 * delivery metadata. Email body is not echoed in the response.
 */
export async function sendDigest(req: Request, res: Response): Promise<void> {
  const parsed = SendDigestBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { digest, rendered, delivery } = await sendDigestEmail(parsed.data.siteUrl, {
      recipient: parsed.data.recipient,
      windowDays: parsed.data.windowDays,
    });
    res.json({
      delivery,
      subject: rendered.subject,
      period: digest.period,
      attributedRevenue: digest.outcomes.attributedRevenue,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[InsightsAPI] sendDigest error");
    res.status(400).json({ error: msg });
  }
}
