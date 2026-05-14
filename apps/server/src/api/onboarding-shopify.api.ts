// ============================================================================
// Onboarding (Shopify quick paste-URL flow) — Phase 1.1.5.
//
// Orchestrates the vertical slice:
//   1.1.1 detectPlatform           — confirm the URL is actually Shopify
//   1.1.2 listProducts (Storefront) — via ingest in step 3
//   1.1.3 ingestShopifyCatalog     — populate SiteCatalog
//   1.1.4 walkPageMap              — populate SiteMap
//
// Returns a single payload the wizard renders as a preview. Synchronous for
// Phase 1.1; Phase 3 will swap this for a WS-streamed progress channel.
// ============================================================================

import type { Request, Response } from "express";
import { SiteConfigRepo } from "@ava/db";
import { detectPlatform } from "../crawl/platform-detect.service.js";
import { ingestShopifyCatalog } from "../crawl/catalog-ingest.service.js";
import { walkPageMap } from "../crawl/page-map-walker.service.js";
import { ShopifyStorefrontError } from "../crawl/shopify-storefront.client.js";
import { ShopifyQuickOnboardSchema } from "../validation/schemas.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "onboarding-shopify" });

/** Normalize "example.myshopify.com" / "https://example.myshopify.com/" to a canonical https URL. */
function normalizeShopUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  url = url.replace(/\/+$/, "");
  return url;
}

/**
 * POST /api/onboarding/shopify-quick
 *
 * Request:  { shopUrl, storefrontToken, maxProducts? }
 * Response: 200 { siteUrl, platform, products, sitemap, durationMs }
 *           400 validation
 *           401 invalid Storefront token (caller re-prompts)
 *           404 shop not found
 *           429 Storefront rate limit
 *           502 upstream/network error
 */
export async function shopifyQuickOnboard(req: Request, res: Response): Promise<void> {
  const parsed = ShopifyQuickOnboardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const { shopUrl: rawShopUrl, storefrontToken, maxProducts } = parsed.data;
  const shopUrl = normalizeShopUrl(rawShopUrl);
  const startedAt = Date.now();
  let siteConfig: Awaited<ReturnType<typeof SiteConfigRepo.installShopify>>;

  // 1. Detection — verify this is actually a Shopify store before we burn
  //    API quota. We probe the homepage HTML + response headers.
  let detection: Awaited<ReturnType<typeof fetchAndDetect>>;
  try {
    detection = await fetchAndDetect(shopUrl);
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Shopify] detection fetch failed");
    res.status(502).json({ error: "Could not reach the shop URL", detail: (err as Error).message });
    return;
  }
  if (detection.platform !== "shopify" || detection.confidence < 0.6) {
    res.status(400).json({
      error: "URL does not appear to be a Shopify store",
      detection,
    });
    return;
  }

  // 2. Persist a minimal SiteConfig + generate a siteKey for the widget snippet.
  //    Uses installShopify (added in #21) — find-or-update so re-runs are idempotent.
  try {
    siteConfig = await SiteConfigRepo.installShopify({
      siteUrl: shopUrl,
      shop: new URL(shopUrl).hostname,
      // Storefront tokens are NOT Admin OAuth tokens. We store them in a
      // separate column so a future Phase 1.3 OAuth install doesn't clash.
      // Until that column exists, reuse shopifyAccessToken (Admin-API field
      // is empty in 1.1 anyway). TODO Phase 1.3: split column.
      accessToken: storefrontToken,
      // Analyze/preview must not activate tracking. The widget stays dormant
      // until the wizard calls the explicit activation endpoint.
      integrationStatus: "mapped",
    });
  } catch (err) {
    log.error({ err, shopUrl }, "[Onboarding/Shopify] SiteConfig persist failed");
    res.status(500).json({ error: "Failed to persist site config" });
    return;
  }

  // 3. Catalog ingest — Storefront API → SiteCatalog. Bounded by maxProducts.
  let catalogResult: Awaited<ReturnType<typeof ingestShopifyCatalog>>;
  try {
    catalogResult = await ingestShopifyCatalog(shopUrl, shopUrl, storefrontToken, { maxProducts });
  } catch (err) {
    if (err instanceof ShopifyStorefrontError) {
      const status = err.kind === "unauthorized" ? 401
        : err.kind === "forbidden" ? 403
        : err.kind === "not_found" ? 404
        : err.kind === "rate_limited" ? 429
        : 502;
      res.status(status).json({ error: err.message, kind: err.kind, retryAfterSec: err.retryAfterSec });
      return;
    }
    log.error({ err, shopUrl }, "[Onboarding/Shopify] catalog ingest failed");
    res.status(500).json({ error: "Catalog ingest failed" });
    return;
  }

  // 4. Page-map walk — sitemap → classify → SiteMap. Independent of catalog;
  //    a sitemap-less or partial-sitemap shop still gets a valid response.
  let pageMap: Awaited<ReturnType<typeof walkPageMap>>;
  try {
    pageMap = await walkPageMap({ siteUrl: shopUrl });
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Shopify] page-map walk failed (non-fatal)");
    pageMap = {
      siteUrl: shopUrl,
      totalUrls: 0,
      classifiedUrls: 0,
      byPageType: {},
      sitemapsFetched: 0,
    };
  }

  res.json({
    siteId: siteConfig.id,
    siteKey: siteConfig.siteKey ?? null,
    siteUrl: shopUrl,
    platform: "shopify",
    detection,
    products: {
      ingested: catalogResult.ingested,
      skipped: catalogResult.skipped,
      errored: catalogResult.errored,
      pagesWalked: catalogResult.pagesWalked,
    },
    sitemap: {
      totalUrls: pageMap.totalUrls,
      classifiedUrls: pageMap.classifiedUrls,
      sitemapsFetched: pageMap.sitemapsFetched,
      byPageType: pageMap.byPageType,
    },
    durationMs: Date.now() - startedAt,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch the shop homepage and run platform detection over the response. */
async function fetchAndDetect(shopUrl: string) {
  const resp = await fetch(shopUrl, {
    method: "GET",
    headers: { "Accept": "text/html", "User-Agent": "AVA-Onboarding/1.0" },
    redirect: "follow",
  });
  const html = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return detectPlatform({ url: shopUrl, html, headers });
}
