// ============================================================================
// Webhooks API — delivery stats + configuration endpoints
// ============================================================================

import type { Request, Response } from "express";
import { WebhookDeliveryRepo, SiteConfigRepo } from "@ava/db";
import { prisma } from "@ava/db";

function parseSiteUrl(req: Request): string | undefined {
  return req.query.siteUrl as string | undefined;
}

/**
 * GET /api/webhooks/stats?siteUrl=
 * Returns 24h webhook delivery stats for a site.
 */
export async function getWebhookStats(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) {
      res.status(400).json({ error: "siteUrl is required" });
      return;
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [stats, recent] = await Promise.all([
      WebhookDeliveryRepo.getWebhookDeliveryStats(siteUrl, since24h),
      WebhookDeliveryRepo.getRecentWebhookDeliveries(siteUrl, 20),
    ]);

    res.json({
      siteUrl,
      window: "24h",
      stats: {
        total: stats.total,
        delivered: stats.delivered,
        failed: stats.failed,
        pending: stats.pending,
        successRate: stats.successRate,
      },
      recent: recent.map((d) => ({
        id: d.id,
        sessionId: d.sessionId,
        status: d.status,
        attempts: d.attempts,
        responseCode: d.responseCode,
        createdAt: d.createdAt,
        lastAttemptAt: d.lastAttemptAt,
        errorMessage: d.errorMessage,
      })),
    });
  } catch (err) {
    console.error("[WebhooksAPI] getWebhookStats error:", err);
    res.status(500).json({ error: "Failed to fetch webhook stats" });
  }
}

/**
 * PUT /api/webhooks/config?siteUrl=
 * Update webhook URL and secret for a site.
 */
export async function updateWebhookConfig(req: Request, res: Response): Promise<void> {
  try {
    const siteUrl = parseSiteUrl(req);
    if (!siteUrl) {
      res.status(400).json({ error: "siteUrl is required" });
      return;
    }

    const { webhookUrl, webhookSecret } = req.body as { webhookUrl?: string; webhookSecret?: string };
    const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(siteUrl).catch(() => null);
    if (!siteConfig) {
      res.status(404).json({ error: "Site not found" });
      return;
    }

    await prisma.siteConfig.update({
      where: { id: siteConfig.id },
      data: {
        ...(webhookUrl !== undefined ? { webhookUrl } : {}),
        ...(webhookSecret !== undefined ? { webhookSecret } : {}),
      },
    });

    res.json({ success: true, siteUrl, webhookUrl: webhookUrl ?? siteConfig.webhookUrl });
  } catch (err) {
    console.error("[WebhooksAPI] updateWebhookConfig error:", err);
    res.status(500).json({ error: "Failed to update webhook config" });
  }
}
