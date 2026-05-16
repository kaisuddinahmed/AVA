// ============================================================================
// Catalog ingest service — pumps Storefront API products into SiteCatalogRepo.
//
// Phase 1.1.3. Pure transform + persist layer. The orchestrator drives
// pagination so memory stays bounded for large catalogs (each page persists
// before the next is fetched).
//
// Per-product upsert isolates failures: one bad row never blocks the rest.
// Per-page fetch errors (auth, network, rate limits) bubble up — those are
// fatal for the wizard session and the user needs to see them.
// ============================================================================

import { SiteCatalogRepo } from "@ava/db";
import { logger } from "../logger.js";
import { listProducts, ShopifyStorefrontError, type StorefrontProduct } from "./shopify-storefront.client.js";
import {
  listProducts as adminListProducts,
  ShopifyAdminError,
  type AdminProduct,
} from "./shopify-admin.client.js";
import {
  listProducts as wooListProducts,
  WooCommerceError,
  type WooProduct,
  type WooCredentials,
} from "./woocommerce.client.js";

const log = logger.child({ service: "crawl" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IngestResult {
  /** Products successfully upserted into SiteCatalog. */
  ingested: number;
  /** Products skipped because required fields were missing (no handle/title). */
  skipped: number;
  /** Per-product upsert failures (network/db errors). */
  errored: number;
  /** Total Storefront pages walked. */
  pagesWalked: number;
  /** Final cursor — null if the catalog was fully drained. */
  endCursor: string | null;
}

export interface IngestOptions {
  /** Storefront page size (1..250, default 50). */
  pageSize?: number;
  /** Safety cap on total products ingested. Default 5000. */
  maxProducts?: number;
  /** Inject a fetch impl (used by tests). Falls through to listProducts. */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Transform: StorefrontProduct → SiteCatalogRepo.UpsertProductInput
// ---------------------------------------------------------------------------

type UpsertInput = Parameters<typeof SiteCatalogRepo.upsertProduct>[0];

/** Derive a single availability string from a product's variant inventory. */
function deriveAvailability(p: StorefrontProduct): "in_stock" | "out_of_stock" | "partial" {
  if (p.variants.length === 0) {
    return p.availableForSale ? "in_stock" : "out_of_stock";
  }
  const available = p.variants.filter((v) => v.availableForSale).length;
  if (available === 0) return "out_of_stock";
  if (available === p.variants.length) return "in_stock";
  return "partial";
}

/** Required fields for a row to be worth persisting. */
function isIngestable(p: StorefrontProduct): boolean {
  return Boolean(p.id && p.handle && p.title);
}

export function toCatalogInput(siteUrl: string, p: StorefrontProduct): UpsertInput {
  return {
    siteUrl,
    externalId: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    productType: p.productType,
    tags: JSON.stringify(p.tags),
    imageUrl: p.imageUrl,
    url: p.onlineStoreUrl,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    currency: p.currency || "USD",
    variants: JSON.stringify(p.variants),
    availability: deriveAvailability(p),
    source: "shopify_storefront",
  };
}

// ---------------------------------------------------------------------------
// Single-page ingest — used directly by tests + by the orchestrator below.
// ---------------------------------------------------------------------------

/**
 * Persist a batch of Storefront products to SiteCatalog. Per-product failures
 * are isolated — they increment `errored` but don't halt the batch.
 */
export async function ingestProducts(
  siteUrl: string,
  products: StorefrontProduct[],
): Promise<{ ingested: number; skipped: number; errored: number }> {
  let ingested = 0;
  let skipped = 0;
  let errored = 0;

  for (const p of products) {
    if (!isIngestable(p)) {
      skipped++;
      continue;
    }
    try {
      await SiteCatalogRepo.upsertProduct(toCatalogInput(siteUrl, p));
      ingested++;
    } catch (err) {
      errored++;
      log.warn({ err, siteUrl, externalId: p.id }, "[Catalog] product upsert failed");
    }
  }

  return { ingested, skipped, errored };
}

// ---------------------------------------------------------------------------
// Full-catalog ingest — drives pagination and bounds memory per-page.
// ---------------------------------------------------------------------------

/**
 * Ingest a Shopify shop's full Storefront catalog into SiteCatalog. Walks
 * the pagination cursor, persisting each page before fetching the next, so
 * peak memory stays bounded to one page's worth of products.
 *
 * Stops when:
 *   - Storefront reports `hasNextPage: false`
 *   - The `maxProducts` safety cap is reached
 *
 * Storefront errors (auth, rate limit, network) bubble up unchanged so the
 * wizard can surface a useful error to the user.
 */
export async function ingestShopifyCatalog(
  siteUrl: string,
  shopUrl: string,
  token: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const maxProducts = opts.maxProducts ?? 5000;
  let cursor: string | null = null;
  let ingested = 0;
  let skipped = 0;
  let errored = 0;
  let pagesWalked = 0;

  while (true) {
    let page: Awaited<ReturnType<typeof listProducts>>;
    try {
      page = await listProducts(shopUrl, token, cursor, {
        pageSize: opts.pageSize,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      // Fatal — let the wizard see the kind-tagged error.
      if (err instanceof ShopifyStorefrontError) throw err;
      throw new ShopifyStorefrontError("network", `Catalog ingest fetch failed: ${(err as Error).message}`);
    }

    pagesWalked++;

    // Trim the page to respect maxProducts cap.
    const remaining = maxProducts - ingested - skipped;
    const pageProducts = page.products.slice(0, Math.max(0, remaining));

    const pageStats = await ingestProducts(siteUrl, pageProducts);
    ingested += pageStats.ingested;
    skipped += pageStats.skipped;
    errored += pageStats.errored;

    log.info(
      {
        siteUrl,
        page: pagesWalked,
        pageIngested: pageStats.ingested,
        pageSkipped: pageStats.skipped,
        pageErrored: pageStats.errored,
        cumulativeIngested: ingested,
      },
      "[Catalog] page ingested",
    );

    if (!page.pageInfo.hasNextPage) {
      cursor = null;
      break;
    }
    if (ingested + skipped >= maxProducts) {
      cursor = page.pageInfo.endCursor;
      log.warn({ siteUrl, maxProducts }, "[Catalog] hit maxProducts cap, stopping");
      break;
    }
    cursor = page.pageInfo.endCursor;
  }

  return { ingested, skipped, errored, pagesWalked, endCursor: cursor };
}

// ---------------------------------------------------------------------------
// Admin-API ingest fallback (Phase 1.3 hardening)
// ---------------------------------------------------------------------------
//
// Used when the OAuth callback fails to mint a delegated Storefront token
// (e.g. the merchant's install didn't grant unauthenticated_read_product_*
// scopes). The Admin API can satisfy the same upsert contract, just over a
// different transport. Distinct `source: shopify_admin` so analytics can
// tell which path produced each row.

/** Derive availability from AdminProduct's variant inventory + status. */
function deriveAdminAvailability(p: AdminProduct): "in_stock" | "out_of_stock" | "partial" {
  if (p.status === "ARCHIVED" || p.status === "DRAFT") return "out_of_stock";
  if (p.variants.length === 0) {
    // No variant info — fall back to totalInventory if Shopify tracks it.
    if (p.totalInventory === null) return "in_stock"; // tracking disabled = treat as available
    return p.totalInventory > 0 ? "in_stock" : "out_of_stock";
  }
  const available = p.variants.filter(
    (v) => (v.inventoryQuantity ?? 0) > 0 || v.inventoryPolicy === "CONTINUE",
  ).length;
  if (available === 0) return "out_of_stock";
  if (available === p.variants.length) return "in_stock";
  return "partial";
}

export function toAdminCatalogInput(siteUrl: string, p: AdminProduct): UpsertInput {
  const variants = p.variants.map((v) => ({
    id: v.id,
    title: v.title,
    sku: v.sku,
    price: v.price,
    availableForSale: (v.inventoryQuantity ?? 0) > 0 || v.inventoryPolicy === "CONTINUE",
    quantityAvailable: v.inventoryQuantity,
    options: v.options,
  }));
  return {
    siteUrl,
    externalId: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    productType: p.productType,
    tags: JSON.stringify(p.tags),
    imageUrl: p.imageUrl,
    url: p.onlineStoreUrl,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    currency: p.currency || "USD",
    variants: JSON.stringify(variants),
    availability: deriveAdminAvailability(p),
    source: "shopify_admin",
  };
}

function isAdminIngestable(p: AdminProduct): boolean {
  return Boolean(p.id && p.handle && p.title);
}

/**
 * Ingest a Shopify shop's catalog via the Admin API when the Storefront path
 * isn't available. Same pagination + bounded-memory shape as
 * `ingestShopifyCatalog`. Errors bubble up as `ShopifyAdminError`.
 */
export async function ingestShopifyCatalogViaAdmin(
  siteUrl: string,
  shopUrl: string,
  adminToken: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const maxProducts = opts.maxProducts ?? 5000;
  let cursor: string | null = null;
  let ingested = 0;
  let skipped = 0;
  let errored = 0;
  let pagesWalked = 0;

  while (true) {
    let page: Awaited<ReturnType<typeof adminListProducts>>;
    try {
      page = await adminListProducts(shopUrl, adminToken, cursor, {
        pageSize: opts.pageSize,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      if (err instanceof ShopifyAdminError) throw err;
      throw new ShopifyAdminError("network", `Admin catalog ingest failed: ${(err as Error).message}`);
    }

    pagesWalked++;

    const remaining = maxProducts - ingested - skipped;
    const pageProducts = page.products.slice(0, Math.max(0, remaining));

    for (const p of pageProducts) {
      if (!isAdminIngestable(p)) {
        skipped++;
        continue;
      }
      try {
        await SiteCatalogRepo.upsertProduct(toAdminCatalogInput(siteUrl, p));
        ingested++;
      } catch (err) {
        errored++;
        log.warn({ err, siteUrl, externalId: p.id }, "[Catalog/Admin] upsert failed");
      }
    }

    log.info(
      { siteUrl, page: pagesWalked, cumulativeIngested: ingested, source: "shopify_admin" },
      "[Catalog/Admin] page ingested",
    );

    if (!page.pageInfo.hasNextPage) {
      cursor = null;
      break;
    }
    if (ingested + skipped >= maxProducts) {
      cursor = page.pageInfo.endCursor;
      log.warn({ siteUrl, maxProducts }, "[Catalog/Admin] hit maxProducts cap, stopping");
      break;
    }
    cursor = page.pageInfo.endCursor;
  }

  return { ingested, skipped, errored, pagesWalked, endCursor: cursor };
}

// ---------------------------------------------------------------------------
// WooCommerce ingest (Phase 1.4.2)
// ---------------------------------------------------------------------------
//
// Same upsert contract, different transport. Two `source` tags so we can
// tell ingest paths apart in analytics:
//   - "woocommerce_store" : public Store API (no auth)
//   - "woocommerce_rest"  : authenticated REST v3 (consumer key/secret)
//
// Pagination is page-number based; the underlying client converts it to a
// `nextPage: number | null` cursor.

function deriveWooAvailability(p: WooProduct): "in_stock" | "out_of_stock" | "partial" {
  // Store API doesn't expose per-variant inventory; REST v3 returns only
  // variation IDs at the products endpoint. So we map availableForSale at
  // the product level for now. Per-variant inventory is a Phase 1.5
  // enhancement (requires N+1 variation fetch).
  return p.availableForSale ? "in_stock" : "out_of_stock";
}

function sourceFor(credentials: WooCredentials): "woocommerce_store" | "woocommerce_rest" {
  return credentials.kind === "store_api" ? "woocommerce_store" : "woocommerce_rest";
}

export function toWooCatalogInput(
  siteUrl: string,
  p: WooProduct,
  source: "woocommerce_store" | "woocommerce_rest",
): UpsertInput {
  return {
    siteUrl,
    externalId: `wc:${p.id}`,
    handle: p.handle,
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    productType: p.productType,
    tags: JSON.stringify(p.tags),
    imageUrl: p.imageUrl,
    url: p.onlineStoreUrl,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    currency: p.currency || "USD",
    variants: JSON.stringify(p.variants),
    availability: deriveWooAvailability(p),
    source,
  };
}

function isWooIngestable(p: WooProduct): boolean {
  return Boolean(p.id && p.handle && p.title);
}

/**
 * Ingest a WooCommerce site's full catalog into SiteCatalog. Walks the
 * page-number cursor, persisting each page before fetching the next.
 *
 * Errors bubble up as `WooCommerceError` so the wizard can surface kind-tagged
 * messages ("unauthorized" → prompt for new consumer key).
 */
export async function ingestWooCommerceCatalog(
  siteUrl: string,
  shopUrl: string,
  credentials: WooCredentials,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const maxProducts = opts.maxProducts ?? 5000;
  const source = sourceFor(credentials);
  let page: number | null = 1;
  let ingested = 0;
  let skipped = 0;
  let errored = 0;
  let pagesWalked = 0;

  while (page !== null) {
    let result: Awaited<ReturnType<typeof wooListProducts>>;
    try {
      result = await wooListProducts(shopUrl, credentials, page, {
        pageSize: opts.pageSize,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      if (err instanceof WooCommerceError) throw err;
      throw new WooCommerceError("network", `Woo catalog ingest failed: ${(err as Error).message}`);
    }

    pagesWalked++;

    const remaining = maxProducts - ingested - skipped;
    const pageProducts = result.products.slice(0, Math.max(0, remaining));

    for (const p of pageProducts) {
      if (!isWooIngestable(p)) {
        skipped++;
        continue;
      }
      try {
        await SiteCatalogRepo.upsertProduct(toWooCatalogInput(siteUrl, p, source));
        ingested++;
      } catch (err) {
        errored++;
        log.warn({ err, siteUrl, externalId: p.id }, "[Catalog/Woo] upsert failed");
      }
    }

    log.info(
      { siteUrl, page: pagesWalked, source, cumulativeIngested: ingested, totalCount: result.totalCount },
      "[Catalog/Woo] page ingested",
    );

    if (ingested + skipped >= maxProducts) {
      log.warn({ siteUrl, maxProducts }, "[Catalog/Woo] hit maxProducts cap, stopping");
      break;
    }
    page = result.nextPage;
  }

  return { ingested, skipped, errored, pagesWalked, endCursor: page === null ? null : String(page) };
}
