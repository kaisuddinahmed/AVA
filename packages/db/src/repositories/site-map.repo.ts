// ============================================================================
// SiteMap Repository — crawler output: page-type → URL pattern + selectors
// Phase 1 — Site Awareness.
// ============================================================================

import { prisma } from "../client.js";

export type UpsertSiteMapInput = {
  siteUrl: string;
  pageType: string;       // home | category | search_results | pdp | cart | checkout | account | other
  urlPattern: string;
  sampleUrls: string;     // JSON: string[]
  keySelectors: string;   // JSON: { addToCart?, priceEl?, ... }
  pageCount?: number;
};

/** Insert or update a site-map entry for (siteUrl, pageType). */
export async function upsertSiteMap(data: UpsertSiteMapInput) {
  return prisma.siteMap.upsert({
    where: { siteUrl_pageType: { siteUrl: data.siteUrl, pageType: data.pageType } },
    update: {
      urlPattern: data.urlPattern,
      sampleUrls: data.sampleUrls,
      keySelectors: data.keySelectors,
      pageCount: data.pageCount ?? 0,
      lastCrawledAt: new Date(),
    },
    create: data,
  });
}

/** List all site-map entries for a site. */
export async function listBySite(siteUrl: string) {
  return prisma.siteMap.findMany({
    where: { siteUrl },
    orderBy: { pageType: "asc" },
  });
}

/** Look up a single page-type entry. */
export async function getByPageType(siteUrl: string, pageType: string) {
  return prisma.siteMap.findUnique({
    where: { siteUrl_pageType: { siteUrl, pageType } },
  });
}

/** Delete all site-map entries for a site (rare — used on re-crawl reset). */
export async function clearSite(siteUrl: string) {
  return prisma.siteMap.deleteMany({ where: { siteUrl } });
}
