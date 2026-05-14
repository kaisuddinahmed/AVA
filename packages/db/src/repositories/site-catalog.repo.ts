// ============================================================================
// SiteCatalog Repository — ingested product/variant catalog per site
// Phase 1 — Site Awareness (Shopify Storefront/Admin, WooCommerce REST,
// generic JSON-LD crawl).
// ============================================================================

import { prisma } from "../client.js";

export type UpsertProductInput = {
  siteUrl: string;
  externalId: string;
  handle?: string | null;
  title: string;
  description?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string | null;       // JSON: string[]
  imageUrl?: string | null;
  url?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string;
  variants: string;           // JSON: Variant[]
  availability?: string;      // in_stock | out_of_stock | partial
  source: string;             // shopify_admin | shopify_storefront | woocommerce_rest | json_ld | manual
};

/** Insert or update a product by (siteUrl, externalId). */
export async function upsertProduct(data: UpsertProductInput) {
  const { siteUrl, externalId, ...rest } = data;
  return prisma.siteCatalog.upsert({
    where: { siteUrl_externalId: { siteUrl, externalId } },
    update: { ...rest, lastIngestedAt: new Date() },
    create: { siteUrl, externalId, ...rest },
  });
}

/** Bulk upsert — used by ingestion jobs. Returns the count of touched rows. */
export async function bulkUpsertProducts(items: UpsertProductInput[]) {
  let touched = 0;
  for (const item of items) {
    await upsertProduct(item);
    touched++;
  }
  return touched;
}

/** Fetch a single product. */
export async function getProduct(siteUrl: string, externalId: string) {
  return prisma.siteCatalog.findUnique({
    where: { siteUrl_externalId: { siteUrl, externalId } },
  });
}

/** Look up by handle (URL slug). */
export async function getByHandle(siteUrl: string, handle: string) {
  return prisma.siteCatalog.findFirst({ where: { siteUrl, handle } });
}

/** List products for a site, newest first. */
export async function listBySite(siteUrl: string, options?: { limit?: number }) {
  return prisma.siteCatalog.findMany({
    where: { siteUrl },
    orderBy: { lastIngestedAt: "desc" },
    take: options?.limit ?? 500,
  });
}

/** List in-stock products for a site. */
export async function listAvailable(siteUrl: string, options?: { limit?: number }) {
  return prisma.siteCatalog.findMany({
    where: { siteUrl, availability: "in_stock" },
    orderBy: { lastIngestedAt: "desc" },
    take: options?.limit ?? 500,
  });
}

/** Count products in a site catalog. */
export async function countBySite(siteUrl: string) {
  return prisma.siteCatalog.count({ where: { siteUrl } });
}

/** Wipe a site catalog (used before a full re-ingest). */
export async function clearSite(siteUrl: string) {
  return prisma.siteCatalog.deleteMany({ where: { siteUrl } });
}
