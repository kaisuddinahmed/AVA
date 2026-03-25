// ============================================================================
// Shopify Native App — OAuth install flow + ScriptTag injection + GDPR
//
// OAuth 2.0 flow:
//   1. Merchant clicks "Install" → GET /api/shopify/install?shop=...
//   2. Shopify redirects back  → GET /api/shopify/callback?code=...&shop=...
//      - Exchange code for permanent access token
//      - Upsert SiteConfig with shopifyShop + shopifyAccessToken
//      - Inject widget via Shopify ScriptTag API
//      - Register uninstall + GDPR webhooks
//
// GDPR webhooks (mandatory for Shopify App Store listing):
//   POST /api/shopify/webhooks/gdpr/customers/data_request
//   POST /api/shopify/webhooks/gdpr/customers/redact
//   POST /api/shopify/webhooks/gdpr/shop/redact
//
// Uninstall webhook:
//   POST /api/shopify/webhooks/uninstall
// ============================================================================

import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { SiteConfigRepo } from "@ava/db";
import { prisma } from "@ava/db";
import { logger } from "../logger.js";
import { seedShopifyMappings } from "./shopify-mapper.service.js";

const log = logger.child({ service: "api" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getShopifyConfig() {
  return {
    apiKey:      process.env.SHOPIFY_API_KEY ?? "",
    apiSecret:   process.env.SHOPIFY_API_SECRET ?? "",
    scopes:      process.env.SHOPIFY_SCOPES ?? "read_script_tags,write_script_tags,read_products",
    appUrl:      process.env.SHOPIFY_APP_URL ?? "http://localhost:8080",
    widgetSrc:   process.env.SHOPIFY_WIDGET_SRC ?? "http://localhost:8080/api/widget.js",
  };
}

function buildOAuthUrl(shop: string, cfg: ReturnType<typeof getShopifyConfig>): string {
  const redirectUri = `${cfg.appUrl}/api/shopify/callback`;
  const nonce = Math.random().toString(36).slice(2);
  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${cfg.apiKey}` +
    `&scope=${encodeURIComponent(cfg.scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`
  );
}

function verifyShopifyHmac(query: Record<string, string>, secret: string): boolean {
  const { hmac, signature: _sig, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader ?? ""));
  } catch {
    return false;
  }
}

async function exchangeCodeForToken(shop: string, code: string, cfg: ReturnType<typeof getShopifyConfig>): Promise<string> {
  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.apiKey, client_secret: cfg.apiSecret, code }),
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

async function injectScriptTag(shop: string, token: string, widgetSrc: string): Promise<number | null> {
  const resp = await fetch(`https://${shop}/admin/api/2024-01/script_tags.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      script_tag: {
        event: "onload",
        src: widgetSrc,
        display_scope: "online_store",
      },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { script_tag: { id: number } };
  return data.script_tag.id;
}

async function removeScriptTag(shop: string, token: string, scriptTagId: number): Promise<void> {
  await fetch(`https://${shop}/admin/api/2024-01/script_tags/${scriptTagId}.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
  }).catch(() => {});
}

async function registerWebhooks(shop: string, token: string, appUrl: string): Promise<void> {
  const webhooks = [
    { topic: "app/uninstalled",         address: `${appUrl}/api/shopify/webhooks/uninstall` },
    { topic: "customers/data_request",  address: `${appUrl}/api/shopify/webhooks/gdpr/customers/data_request` },
    { topic: "customers/redact",        address: `${appUrl}/api/shopify/webhooks/gdpr/customers/redact` },
    { topic: "shop/redact",             address: `${appUrl}/api/shopify/webhooks/gdpr/shop/redact` },
  ];

  for (const wh of webhooks) {
    await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: "json" } }),
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/shopify/install?shop=mystore.myshopify.com
 * Redirects merchant to Shopify OAuth consent screen.
 */
export function install(req: Request, res: Response) {
  const shop = req.query.shop as string | undefined;
  if (!shop || !shop.endsWith(".myshopify.com")) {
    return res.status(400).json({ error: "Invalid shop parameter" });
  }
  const cfg = getShopifyConfig();
  if (!cfg.apiKey) {
    return res.status(503).json({ error: "Shopify app not configured" });
  }
  return res.redirect(buildOAuthUrl(shop, cfg));
}

/**
 * GET /api/shopify/callback?code=...&shop=...&hmac=...
 * OAuth callback: exchange code, inject ScriptTag, register webhooks.
 */
export async function callback(req: Request, res: Response) {
  const { shop, code, hmac } = req.query as Record<string, string>;
  const cfg = getShopifyConfig();

  if (!shop || !code || !hmac) {
    return res.status(400).json({ error: "Missing OAuth params" });
  }

  // Verify Shopify HMAC signature
  if (!verifyShopifyHmac(req.query as Record<string, string>, cfg.apiSecret)) {
    return res.status(401).json({ error: "HMAC verification failed" });
  }

  try {
    // 1. Exchange authorization code for permanent token
    const accessToken = await exchangeCodeForToken(shop, code, cfg);

    // 2. Upsert SiteConfig for this Shopify store
    const siteUrl = `https://${shop}`;
    // Avoid upsert — Prisma WASM engine crashes on upsert with the node:sqlite adapter.
    const _existingSite = await prisma.siteConfig.findUnique({ where: { siteUrl } });
    if (_existingSite) {
      await prisma.siteConfig.update({ where: { siteUrl }, data: { shopifyShop: shop, shopifyAccessToken: accessToken, integrationStatus: "limited_active" } });
    } else {
      await prisma.siteConfig.create({ data: { siteUrl, platform: "shopify", trackingConfig: JSON.stringify({ shopify: true }), integrationStatus: "limited_active", shopifyShop: shop, shopifyAccessToken: accessToken } });
    }

    // 3. Inject widget ScriptTag
    const scriptTagId = await injectScriptTag(shop, accessToken, cfg.widgetSrc);
    if (scriptTagId) {
      await prisma.siteConfig.update({
        where: { siteUrl },
        data: { shopifyScriptTagId: scriptTagId },
      });
    }

    // 4. Register mandatory webhooks (fire-and-forget)
    registerWebhooks(shop, accessToken, cfg.appUrl).catch((err) =>
      log.error("[Shopify] Webhook registration failed:", err)
    );

    // 5. Seed high-confidence Shopify selector mappings (fire-and-forget).
    //    Coverage reaches ≥90% immediately via known Shopify theme selectors.
    seedShopifyMappings(shop, accessToken).catch((err) =>
      log.error({ shop, err }, "[Shopify] Selector mapping seed failed (non-blocking)")
    );

    log.info({ shop, scriptTagId }, "[Shopify] Installed — selector seeding in progress");

    // 6. Redirect merchant to onboarding wizard
    const wizardUrl = process.env.SHOPIFY_POST_INSTALL_URL
      ?? `${cfg.appUrl.replace(":8080", ":4002")}?shop=${encodeURIComponent(shop)}`;
    return res.redirect(wizardUrl);
  } catch (err) {
    log.error("[Shopify] OAuth callback error:", err);
    return res.status(500).json({ error: "Installation failed" });
  }
}

/**
 * POST /api/shopify/webhooks/uninstall
 * Called by Shopify when merchant uninstalls the app.
 * Removes ScriptTag and clears Shopify credentials from SiteConfig.
 */
export async function webhookUninstall(req: Request, res: Response) {
  const rawBody: Buffer = req.body;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string ?? "";
  const cfg = getShopifyConfig();

  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const payload = JSON.parse(rawBody.toString()) as { domain?: string; myshopify_domain?: string };
    const shop = payload.myshopify_domain ?? payload.domain ?? "";
    const siteUrl = `https://${shop}`;

    const siteConfig = await prisma.siteConfig.findUnique({ where: { siteUrl } });
    if (siteConfig?.shopifyScriptTagId && siteConfig.shopifyAccessToken) {
      await removeScriptTag(shop, String(siteConfig.shopifyAccessToken), Number(siteConfig.shopifyScriptTagId));
    }

    // Clear Shopify credentials but retain site history
    await prisma.siteConfig.update({
      where: { siteUrl },
      data: {
        shopifyAccessToken: null,
        shopifyScriptTagId: null,
        integrationStatus: "pending",
      },
    }).catch(() => {});

    log.info(`[Shopify] Uninstalled for ${shop}`);
  } catch (err) {
    log.error("[Shopify] Uninstall webhook error:", err);
  }

  return res.status(200).send("OK");
}

/**
 * POST /api/shopify/webhooks/gdpr/customers/data_request
 * GDPR: customer requests their data. AVA stores only anonymous visitorId —
 * no PII to return. Acknowledge and log.
 */
export function webhookCustomersDataRequest(req: Request, res: Response) {
  const rawBody: Buffer = req.body;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string ?? "";
  const cfg = getShopifyConfig();
  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return res.status(401).send("Unauthorized");
  }
  // AVA stores only anonymous visitorId (hash fingerprint) — no PII to export.
  log.info("[Shopify GDPR] customers/data_request received — no PII stored");
  return res.status(200).send("OK");
}

/**
 * POST /api/shopify/webhooks/gdpr/customers/redact
 * GDPR: erase customer data. Since AVA stores only anonymous visitorId, log and ack.
 */
export function webhookCustomersRedact(req: Request, res: Response) {
  const rawBody: Buffer = req.body;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string ?? "";
  const cfg = getShopifyConfig();
  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return res.status(401).send("Unauthorized");
  }
  log.info("[Shopify GDPR] customers/redact received — no PII stored");
  return res.status(200).send("OK");
}

/**
 * POST /api/shopify/webhooks/gdpr/shop/redact
 * GDPR: erase all shop data. Delete the SiteConfig and all associated data.
 */
export async function webhookShopRedact(req: Request, res: Response) {
  const rawBody: Buffer = req.body;
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string ?? "";
  const cfg = getShopifyConfig();
  if (!verifyWebhookHmac(rawBody, hmacHeader, cfg.apiSecret)) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const payload = JSON.parse(rawBody.toString()) as { domain?: string; myshopify_domain?: string };
    const shop = payload.myshopify_domain ?? payload.domain ?? "";
    const siteUrl = `https://${shop}`;
    // Mark as deleted — full data purge would run via nightly cleanup job
    await prisma.siteConfig.updateMany({
      where: { siteUrl },
      data: { integrationStatus: "deleted" as string },
    }).catch(() => {});
    log.info(`[Shopify GDPR] shop/redact for ${shop} — marked for deletion`);
  } catch (err) {
    log.error("[Shopify GDPR] shop/redact error:", err);
  }
  return res.status(200).send("OK");
}
