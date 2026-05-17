// ============================================================================
// Billing API — Phase 4.5.
//
// Three endpoints:
//   POST /api/billing/start    → start a subscription change
//   GET  /api/billing/callback → Shopify return URL handler (re-sync state)
//   GET  /api/billing/status   → read current plan + status
// ============================================================================

import type { Request, Response } from "express";
import { z } from "zod";
import { SiteConfigRepo } from "@ava/db";
import { startSubscription, syncSubscriptionStatus } from "../billing/billing.service.js";
import { listPlans } from "../billing/billing-plans.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "billing.api" });

// ── Schemas ────────────────────────────────────────────────────────────────

const StartBodySchema = z.object({
  shopDomain: z.string().min(1, "shopDomain is required"),
  planId: z.enum(["free", "starter", "pro"]),
  returnUrl: z.string().url("returnUrl must be an absolute URL"),
});

const CallbackQuerySchema = z.object({
  shop: z.string().min(1, "shop is required"),
});

const StatusQuerySchema = z.object({
  shopDomain: z.string().min(1, "shopDomain is required"),
});

// ── Handlers ───────────────────────────────────────────────────────────────

/**
 * POST /api/billing/start
 * Body: { shopDomain, planId, returnUrl }
 *
 * Returns { confirmationUrl } for paid plans (merchant must visit to approve)
 * or { confirmationUrl: null } for the free plan.
 */
export async function start(req: Request, res: Response): Promise<void> {
  const parsed = StartBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await startSubscription(parsed.data.shopDomain, parsed.data.planId, parsed.data.returnUrl);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[billing.api] start error");
    res.status(400).json({ error: msg });
  }
}

/**
 * GET /api/billing/callback?shop=…
 * Shopify redirects merchants here after they approve (or decline) the
 * charge. We don't get the AppSubscription gid in the redirect — the
 * standard pattern is to re-query Shopify and reconcile.
 */
export async function callback(req: Request, res: Response): Promise<void> {
  const parsed = CallbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await syncSubscriptionStatus(parsed.data.shop);
    res.json({ shop: parsed.data.shop, synced: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "[billing.api] callback error");
    res.status(500).json({ error: msg });
  }
}

/**
 * GET /api/billing/status?shopDomain=…
 * Returns current persisted plan/status without hitting Shopify.
 * Use /callback to force a fresh sync.
 */
export async function status(req: Request, res: Response): Promise<void> {
  const parsed = StatusQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const config = (await SiteConfigRepo.getSiteConfigByShopifyShop(parsed.data.shopDomain)) as
      | {
        siteUrl: string;
        shopifyAppPlan: string | null;
        shopifyAppSubscriptionStatus: string | null;
        shopifyAppSubscriptionExpiresAt: Date | null;
        shopifyAppSubscriptionTest: boolean | null;
      }
      | null;
    if (!config) {
      res.status(404).json({ error: `No SiteConfig for shopDomain=${parsed.data.shopDomain}` });
      return;
    }
    res.json({
      shopDomain: parsed.data.shopDomain,
      siteUrl: config.siteUrl,
      plan: config.shopifyAppPlan,
      status: config.shopifyAppSubscriptionStatus,
      expiresAt: config.shopifyAppSubscriptionExpiresAt,
      test: config.shopifyAppSubscriptionTest,
    });
  } catch (err) {
    log.error({ err: String(err) }, "[billing.api] status error");
    res.status(500).json({ error: "Failed to read billing status" });
  }
}

/**
 * GET /api/billing/plans
 * Returns the plan registry for the dashboard UI to render.
 */
export async function plans(_req: Request, res: Response): Promise<void> {
  res.json({ plans: listPlans() });
}
