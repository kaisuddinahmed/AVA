// ============================================================================
// Onboarding (WooCommerce quick paste-URL flow) — Phase 1.4.3.
//
// Mirrors onboarding-shopify.api.ts. Vertical slice:
//   1. detectPlatform        — confirm the URL is actually WooCommerce
//   2. listProducts (Woo)    — via ingest in step 3
//   3. ingestWooCommerce…    — populate SiteCatalog
//   4. walkPageMap           — populate SiteMap
//
// Credentials are optional:
//   - Omit both → public Store API ingest
//   - Both set → REST v3 ingest (richer data, supports inventory)
//
// Persists `integrationStatus: "mapped"` only. The wizard's explicit
// activation endpoint (`POST /api/integration/:siteId/activate`) is what
// flips the site live — never this endpoint.
// ============================================================================

import type { Request, Response } from "express";
import { SiteConfigRepo } from "@ava/db";
import { detectPlatform } from "../crawl/platform-detect.service.js";
import { ingestWooCommerceCatalog } from "../crawl/catalog-ingest.service.js";
import { walkPageMap } from "../crawl/page-map-walker.service.js";
import { WooCommerceError, type WooCredentials } from "../crawl/woocommerce.client.js";
import { WooCommerceQuickOnboardSchema } from "../validation/schemas.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "onboarding-woo" });

/** Normalize "shop.example.com" / "https://shop.example.com/" to a canonical https URL. */
function normalizeShopUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  url = url.replace(/\/+$/, "");
  return url;
}

/**
 * POST /api/onboarding/woocommerce-quick
 *
 * Request:  { shopUrl, consumerKey?, consumerSecret?, maxProducts? }
 * Response: 200 { siteUrl, platform, products, sitemap, durationMs }
 *           400 validation / not-Woo
 *           401 invalid consumer credentials (caller re-prompts)
 *           404 site not reachable or Woo endpoint missing
 *           429 Woo rate limit
 *           502 upstream/network error
 */
export async function wooCommerceQuickOnboard(req: Request, res: Response): Promise<void> {
  const parsed = WooCommerceQuickOnboardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const { shopUrl: rawShopUrl, consumerKey, consumerSecret, maxProducts } = parsed.data;
  const shopUrl = normalizeShopUrl(rawShopUrl);
  const startedAt = Date.now();

  // 1. Detection — verify this is actually a WooCommerce site before we
  //    burn auth attempts. Probes homepage HTML + response headers.
  let detection: Awaited<ReturnType<typeof fetchAndDetect>>;
  try {
    detection = await fetchAndDetect(shopUrl);
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Woo] detection fetch failed");
    res.status(502).json({ error: "Could not reach the shop URL", detail: (err as Error).message });
    return;
  }
  if (detection.platform !== "woocommerce" || detection.confidence < 0.5) {
    res.status(400).json({
      error: "URL does not appear to be a WooCommerce store",
      detection,
    });
    return;
  }

  // 2. Persist a minimal SiteConfig. `integrationStatus: "mapped"` —
  //    activation belongs to the wizard's explicit endpoint, NEVER here.
  let siteConfig: Awaited<ReturnType<typeof SiteConfigRepo.installWooCommerce>>;
  try {
    siteConfig = await SiteConfigRepo.installWooCommerce({
      siteUrl: shopUrl,
      consumerKey: consumerKey ?? null,
      consumerSecret: consumerSecret ?? null,
      integrationStatus: "mapped",
    });
  } catch (err) {
    log.error({ err, shopUrl }, "[Onboarding/Woo] SiteConfig persist failed");
    res.status(500).json({ error: "Failed to persist site config" });
    return;
  }

  // 3. Catalog ingest — public Store API when no creds, REST v3 otherwise.
  const credentials: WooCredentials = consumerKey && consumerSecret
    ? { kind: "rest_v3", consumerKey, consumerSecret }
    : { kind: "store_api" };

  let catalogResult: Awaited<ReturnType<typeof ingestWooCommerceCatalog>>;
  try {
    catalogResult = await ingestWooCommerceCatalog(shopUrl, shopUrl, credentials, { maxProducts });
  } catch (err) {
    if (err instanceof WooCommerceError) {
      const status = err.kind === "unauthorized" ? 401
        : err.kind === "forbidden" ? 403
        : err.kind === "not_found" ? 404
        : err.kind === "rate_limited" ? 429
        : 502;
      res.status(status).json({ error: err.message, kind: err.kind, retryAfterSec: err.retryAfterSec });
      return;
    }
    log.error({ err, shopUrl }, "[Onboarding/Woo] catalog ingest failed");
    res.status(500).json({ error: "Catalog ingest failed" });
    return;
  }

  // 4. Page-map walk — sitemap → classify → SiteMap. Non-fatal on failure;
  //    a sitemap-less site still gets a valid response.
  let pageMap: Awaited<ReturnType<typeof walkPageMap>>;
  try {
    pageMap = await walkPageMap({ siteUrl: shopUrl });
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Woo] page-map walk failed (non-fatal)");
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
    platform: "woocommerce",
    transport: credentials.kind,
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
