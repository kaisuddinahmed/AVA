// ============================================================================
// Unified onboarding endpoint — Phase 1.5.3.
//
// One endpoint, internal dispatch. The wizard stops carrying platform-
// specific endpoint knowledge: it posts to /api/onboarding/quick and the
// server figures out whether to run the Shopify, Woo, or generic path.
//
// Flow:
//   1. Detect the platform from the homepage.
//   2. Shopify → require `storefrontToken`; forward to shopifyQuickOnboard.
//   3. WooCommerce → forward to wooCommerceQuickOnboard (creds optional).
//   4. Otherwise → run the generic path inline (BFS crawl → structured-data
//      ingest → page-map walk). LLM fallback is OFF unless the global
//      `LLM_DOM_MAPPER_ENABLED` flag is `true`.
//
// Existing per-platform endpoints stay in place for backwards compat.
// ============================================================================

import type { Request, Response } from "express";
import { SiteConfigRepo } from "@ava/db";
import { detectPlatform, type PlatformDetection } from "../crawl/platform-detect.service.js";
import { crawlSite } from "../crawl/bfs-crawler.service.js";
import {
  ingestGenericCatalog,
  type GenericIngestPage,
} from "../crawl/catalog-ingest.service.js";
import { walkPageMap } from "../crawl/page-map-walker.service.js";
import { QuickOnboardSchema } from "../validation/schemas.js";
import { shopifyQuickOnboard } from "./onboarding-shopify.api.js";
import { wooCommerceQuickOnboard } from "./onboarding-woo.api.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "onboarding-quick" });

function normalizeShopUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

async function fetchAndDetect(shopUrl: string): Promise<PlatformDetection> {
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

/**
 * POST /api/onboarding/quick
 *
 * Request:  { shopUrl, storefrontToken?, consumerKey?, consumerSecret?, maxProducts? }
 * Response: 200 { siteId, platform, products, sitemap, durationMs, transport? }
 *           400 detection.platform=shopify but storefrontToken missing
 *           400 validation
 *           502 detection fetch failed
 */
export async function quickOnboard(req: Request, res: Response): Promise<void> {
  const parsed = QuickOnboardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const shopUrl = normalizeShopUrl(parsed.data.shopUrl);

  // Detect once. Per-platform handlers re-detect — minor redundancy we
  // accept for the sake of keeping them independently usable.
  let detection: PlatformDetection;
  try {
    detection = await fetchAndDetect(shopUrl);
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Quick] detection fetch failed");
    res.status(502).json({ error: "Could not reach the shop URL", detail: (err as Error).message });
    return;
  }

  // --- Shopify dispatch ----------------------------------------------------
  if (detection.platform === "shopify" && detection.confidence >= 0.6) {
    if (!parsed.data.storefrontToken) {
      res.status(400).json({
        error: "Shopify store detected — a Storefront API token is required.",
        detection,
        requires: ["storefrontToken"],
      });
      return;
    }
    return shopifyQuickOnboard(req, res);
  }

  // --- WooCommerce dispatch -----------------------------------------------
  if (detection.platform === "woocommerce" && detection.confidence >= 0.5) {
    return wooCommerceQuickOnboard(req, res);
  }

  // --- Generic path (custom / low-confidence detection) -------------------
  return runGenericPath(req, res, shopUrl, detection, parsed.data.maxProducts);
}

// ---------------------------------------------------------------------------
// Generic path — BFS + deterministic structured-data ingest
// ---------------------------------------------------------------------------

async function runGenericPath(
  _req: Request,
  res: Response,
  shopUrl: string,
  detection: PlatformDetection,
  maxProducts: number | undefined,
): Promise<void> {
  const startedAt = Date.now();

  // 1. Persist SiteConfig as platform="custom". `mapped` only — never
  //    `limited_active`. Activation belongs to /api/integration/:id/activate.
  let siteConfig: Awaited<ReturnType<typeof SiteConfigRepo.installGenericSite>>;
  try {
    siteConfig = await SiteConfigRepo.installGenericSite({
      siteUrl: shopUrl,
      integrationStatus: "mapped",
    });
  } catch (err) {
    log.error({ err, shopUrl }, "[Onboarding/Quick/Generic] SiteConfig persist failed");
    res.status(500).json({ error: "Failed to persist site config" });
    return;
  }

  // 2. Bounded BFS crawl — caller can tune via env later. Defaults are conservative.
  let pages: GenericIngestPage[];
  let crawl: Awaited<ReturnType<typeof crawlSite>>;
  try {
    crawl = await crawlSite({ rootUrl: shopUrl, maxDepth: 2, maxPages: 30 });
    pages = crawl.pages.map((p) => ({ url: p.url, html: p.html }));
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Quick/Generic] BFS crawl failed");
    pages = [];
    crawl = { pages: [], robotsBlocked: [], errored: [], totalAttempted: 0, sitemapsFromRobots: [] };
  }

  // 3. Ingest — deterministic by default. LLM fallback opts in via env flag
  //    only; the unified endpoint does NOT enable it implicitly.
  const llmFallback = process.env.LLM_DOM_MAPPER_ENABLED === "true";
  const catalogResult = await ingestGenericCatalog(shopUrl, pages, {
    maxProducts,
    llmFallback,
  });

  // 4. Page-map walk — non-fatal on failure.
  let pageMap: Awaited<ReturnType<typeof walkPageMap>>;
  try {
    pageMap = await walkPageMap({ siteUrl: shopUrl });
  } catch (err) {
    log.warn({ err, shopUrl }, "[Onboarding/Quick/Generic] page-map walk failed (non-fatal)");
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
    platform: "custom",
    transport: "generic_crawl",
    detection,
    crawl: {
      pagesFetched: crawl.pages.length,
      robotsBlocked: crawl.robotsBlocked.length,
      errored: crawl.errored.length,
    },
    products: {
      ingested: catalogResult.ingested,
      skipped: catalogResult.skipped,
      errored: catalogResult.errored,
      pdpCount: catalogResult.pdpCount,
      extractedCount: catalogResult.extractedCount,
      coverage: catalogResult.coverage,
      bySource: catalogResult.bySource,
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
