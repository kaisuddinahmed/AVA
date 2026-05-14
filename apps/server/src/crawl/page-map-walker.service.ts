// ============================================================================
// Page-map walker — fetches sitemap.xml, classifies each URL, persists
// SiteMap entries grouped by pageType.
//
// Phase 1.1.4. Composes:
//   - parseSitemap         (1.0.2) for XML extraction
//   - classifyPage         (1.0.3) in URL-only mode (no HTML yet)
//   - SiteMapRepo          (0.9)   for persistence
//
// "Mapping confidence per pageType" feeds the wizard preview and dashboard
// onboarding card. It's NOT the classifier's per-URL confidence — that's
// always low for URL-only inputs (one signal). The pageType-level confidence
// captures: "given how many URLs match this pattern, how much can the widget
// rely on this mapping?". A single matching URL is enough to start; many
// matching URLs saturate to the cap.
// ============================================================================

import { SiteMapRepo } from "@ava/db";
import { logger } from "../logger.js";
import { parseSitemap, type SitemapResult } from "./sitemap.parser.js";
import { classifyPage, type PageType } from "./page-classifier.service.js";

const log = logger.child({ service: "crawl" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WalkInput {
  /** Canonical site URL (used as the SiteMap key). */
  siteUrl: string;
  /** Sitemap URL. Defaults to `${siteUrl}/sitemap.xml`. */
  sitemapUrl?: string;
  /** Inject a fetch impl (used by tests). */
  fetchImpl?: typeof fetch;
  /** Safety cap on total URLs walked. Default 5000. */
  maxUrls?: number;
}

export interface PageTypeMapping {
  count: number;
  /** 0..1 — confidence that this pageType detection generalizes across the site. */
  confidence: number;
  /** Canonical URL pattern (e.g. "/products/:handle"). */
  urlPattern: string;
  /** Up to 5 sample URLs of this type, for the wizard preview card. */
  samples: string[];
}

export interface PageMapResult {
  siteUrl: string;
  totalUrls: number;
  classifiedUrls: number;
  byPageType: Partial<Record<PageType, PageTypeMapping>>;
  /** Pages walked across the sitemap index hierarchy. */
  sitemapsFetched: number;
}

// ---------------------------------------------------------------------------
// Known URL patterns — Shopify-first; generic adapter (Phase 1.5) will derive
// patterns dynamically when these don't apply.
// ---------------------------------------------------------------------------

const KNOWN_PATTERNS: Partial<Record<PageType, string>> = {
  home: "/",
  pdp: "/products/:handle",        // also matches Woo /product/:slug
  category: "/collections/:handle", // also Woo /product-category/:slug
  cart: "/cart",
  checkout: "/checkouts/:token",
  search_results: "/search",
  account: "/account",
};

const SAMPLE_LIMIT = 5;
// Sample buffer cap — bounds memory on huge catalogs. We track the TRUE count
// separately in `countByType` so confidence scaling doesn't get truncated.
const MAX_SAMPLES_KEPT = 50;
const SITEMAP_INDEX_DEPTH_LIMIT = 1; // don't recurse into nested indexes

// ---------------------------------------------------------------------------
// Internal — sitemap fetch + recursion
// ---------------------------------------------------------------------------

async function fetchSitemapText(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const resp = await fetchImpl(url, {
      method: "GET",
      headers: { "Accept": "application/xml, text/xml, */*" },
    });
    if (!resp.ok) {
      log.warn({ url, status: resp.status }, "[PageMap] sitemap fetch non-OK");
      return null;
    }
    return await resp.text();
  } catch (err) {
    log.warn({ url, err }, "[PageMap] sitemap fetch failed");
    return null;
  }
}

interface CollectStats {
  urls: string[];
  sitemapsFetched: number;
}

async function collectUrls(
  rootSitemap: string,
  fetchImpl: typeof fetch,
  maxUrls: number,
): Promise<CollectStats> {
  const collected: string[] = [];
  let sitemapsFetched = 0;
  const queue: Array<{ url: string; depth: number }> = [{ url: rootSitemap, depth: 0 }];

  while (queue.length > 0 && collected.length < maxUrls) {
    const item = queue.shift()!;
    const xml = await fetchSitemapText(item.url, fetchImpl);
    sitemapsFetched++;
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    if (!parsed) continue;
    pushFrom(parsed, item.depth, queue, collected, maxUrls);
  }

  return { urls: collected, sitemapsFetched };
}

function pushFrom(
  parsed: SitemapResult,
  depth: number,
  queue: Array<{ url: string; depth: number }>,
  collected: string[],
  maxUrls: number,
): void {
  if (parsed.kind === "urlset") {
    for (const u of parsed.urls) {
      if (collected.length >= maxUrls) return;
      collected.push(u.loc);
    }
    return;
  }
  // sitemapindex — enqueue children unless we've already recursed too deep.
  if (depth >= SITEMAP_INDEX_DEPTH_LIMIT) {
    log.warn({ depth }, "[PageMap] sitemap index depth limit reached, skipping children");
    return;
  }
  for (const child of parsed.sitemaps) {
    queue.push({ url: child.loc, depth: depth + 1 });
  }
}

// ---------------------------------------------------------------------------
// Internal — confidence scoring
// ---------------------------------------------------------------------------

/**
 * Map URL-count to a 0..1 confidence. Log-scaled so a single URL already
 * clears 0.7, and saturates near the cap on busy sites. The wizard preview
 * uses this for the per-pageType progress ring.
 */
function confidenceFromCount(count: number): number {
  if (count <= 0) return 0;
  // 1 URL → 0.75; 10 URLs → 0.85; 100+ URLs → 0.95.
  const conf = 0.75 + Math.log10(count) * 0.1;
  return Math.round(Math.min(0.95, conf) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Internal — pattern derivation fallback
// ---------------------------------------------------------------------------

/**
 * When we don't have a known pattern (e.g. on non-Shopify generic sites),
 * derive a pattern by inspecting the sample URLs. Replaces the trailing
 * dynamic segment with `:slug`. This is a coarse fallback — the real
 * pattern engine lives in Phase 1.5.
 */
function derivePatternFromSamples(samples: string[]): string {
  if (samples.length === 0) return "/";
  let firstPath: string;
  try {
    firstPath = new URL(samples[0]).pathname;
  } catch {
    firstPath = samples[0];
  }
  const segments = firstPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  // Replace the LAST segment with :slug
  segments[segments.length - 1] = ":slug";
  return "/" + segments.join("/");
}

function patternFor(pageType: PageType, samples: string[]): string {
  return KNOWN_PATTERNS[pageType] ?? derivePatternFromSamples(samples);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk a site's sitemap, classify every URL, and persist one SiteMap row per
 * pageType. Returns aggregate stats + per-type mapping confidence for the
 * wizard preview.
 *
 * Pages classified as "other" are counted but not persisted — they don't
 * contribute to widget routing decisions.
 *
 * Failure modes:
 *   - Sitemap unreachable → returns empty result with sitemapsFetched=0
 *   - Malformed sitemap   → returns empty result
 *   - Per-pageType DB upsert failure → logged + skipped, others still persist
 */
export async function walkPageMap(input: WalkInput): Promise<PageMapResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  const maxUrls = input.maxUrls ?? 5000;
  const sitemapUrl = input.sitemapUrl ?? `${input.siteUrl.replace(/\/$/, "")}/sitemap.xml`;

  const { urls, sitemapsFetched } = await collectUrls(sitemapUrl, fetchImpl, maxUrls);

  // Track full count + a bounded sample buffer separately — confidence
  // scales with the true URL count, not the truncated sample list.
  const countByType = new Map<PageType, number>();
  const samplesByType = new Map<PageType, string[]>();
  let classifiedUrls = 0;
  for (const url of urls) {
    const result = classifyPage("", url); // URL-only mode — HTML not fetched yet
    if (result.pageType === "other") continue;
    classifiedUrls++;
    countByType.set(result.pageType, (countByType.get(result.pageType) ?? 0) + 1);
    const list = samplesByType.get(result.pageType) ?? [];
    if (list.length < MAX_SAMPLES_KEPT) list.push(url);
    samplesByType.set(result.pageType, list);
  }

  const byPageType: Partial<Record<PageType, PageTypeMapping>> = {};
  for (const [pageType, allUrls] of samplesByType) {
    const trueCount = countByType.get(pageType) ?? allUrls.length;
    const samples = allUrls.slice(0, SAMPLE_LIMIT);
    const mapping: PageTypeMapping = {
      count: trueCount,
      confidence: confidenceFromCount(trueCount),
      urlPattern: patternFor(pageType, allUrls),
      samples,
    };
    byPageType[pageType] = mapping;
    try {
      await SiteMapRepo.upsertSiteMap({
        siteUrl: input.siteUrl,
        pageType,
        urlPattern: mapping.urlPattern,
        sampleUrls: JSON.stringify(samples),
        keySelectors: "{}", // populated by Phase 1.2 fingerprint capture
        pageCount: mapping.count,
      });
    } catch (err) {
      log.warn({ err, siteUrl: input.siteUrl, pageType }, "[PageMap] SiteMap upsert failed");
    }
  }

  log.info(
    {
      siteUrl: input.siteUrl,
      totalUrls: urls.length,
      classifiedUrls,
      pageTypes: Object.keys(byPageType),
      sitemapsFetched,
    },
    "[PageMap] walk complete",
  );

  return {
    siteUrl: input.siteUrl,
    totalUrls: urls.length,
    classifiedUrls,
    byPageType,
    sitemapsFetched,
  };
}
