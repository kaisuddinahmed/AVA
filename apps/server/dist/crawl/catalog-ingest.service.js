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
import { listProducts, ShopifyStorefrontError } from "./shopify-storefront.client.js";
import { listProducts as adminListProducts, ShopifyAdminError, } from "./shopify-admin.client.js";
import { listProducts as wooListProducts, WooCommerceError, } from "./woocommerce.client.js";
import { extractGenericProduct } from "./generic-product.extractor.js";
import { classifyPage } from "./page-classifier.service.js";
import { extractProductWithLLM } from "./llm-product-mapper.service.js";
const log = logger.child({ service: "crawl" });
/** Derive a single availability string from a product's variant inventory. */
function deriveAvailability(p) {
    if (p.variants.length === 0) {
        return p.availableForSale ? "in_stock" : "out_of_stock";
    }
    const available = p.variants.filter((v) => v.availableForSale).length;
    if (available === 0)
        return "out_of_stock";
    if (available === p.variants.length)
        return "in_stock";
    return "partial";
}
/** Required fields for a row to be worth persisting. */
function isIngestable(p) {
    return Boolean(p.id && p.handle && p.title);
}
export function toCatalogInput(siteUrl, p) {
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
export async function ingestProducts(siteUrl, products) {
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
        }
        catch (err) {
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
export async function ingestShopifyCatalog(siteUrl, shopUrl, token, opts = {}) {
    const maxProducts = opts.maxProducts ?? 5000;
    let cursor = null;
    let ingested = 0;
    let skipped = 0;
    let errored = 0;
    let pagesWalked = 0;
    while (true) {
        let page;
        try {
            page = await listProducts(shopUrl, token, cursor, {
                pageSize: opts.pageSize,
                fetchImpl: opts.fetchImpl,
            });
        }
        catch (err) {
            // Fatal — let the wizard see the kind-tagged error.
            if (err instanceof ShopifyStorefrontError)
                throw err;
            throw new ShopifyStorefrontError("network", `Catalog ingest fetch failed: ${err.message}`);
        }
        pagesWalked++;
        // Trim the page to respect maxProducts cap.
        const remaining = maxProducts - ingested - skipped;
        const pageProducts = page.products.slice(0, Math.max(0, remaining));
        const pageStats = await ingestProducts(siteUrl, pageProducts);
        ingested += pageStats.ingested;
        skipped += pageStats.skipped;
        errored += pageStats.errored;
        log.info({
            siteUrl,
            page: pagesWalked,
            pageIngested: pageStats.ingested,
            pageSkipped: pageStats.skipped,
            pageErrored: pageStats.errored,
            cumulativeIngested: ingested,
        }, "[Catalog] page ingested");
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
function deriveAdminAvailability(p) {
    if (p.status === "ARCHIVED" || p.status === "DRAFT")
        return "out_of_stock";
    if (p.variants.length === 0) {
        // No variant info — fall back to totalInventory if Shopify tracks it.
        if (p.totalInventory === null)
            return "in_stock"; // tracking disabled = treat as available
        return p.totalInventory > 0 ? "in_stock" : "out_of_stock";
    }
    const available = p.variants.filter((v) => (v.inventoryQuantity ?? 0) > 0 || v.inventoryPolicy === "CONTINUE").length;
    if (available === 0)
        return "out_of_stock";
    if (available === p.variants.length)
        return "in_stock";
    return "partial";
}
export function toAdminCatalogInput(siteUrl, p) {
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
function isAdminIngestable(p) {
    return Boolean(p.id && p.handle && p.title);
}
/**
 * Ingest a Shopify shop's catalog via the Admin API when the Storefront path
 * isn't available. Same pagination + bounded-memory shape as
 * `ingestShopifyCatalog`. Errors bubble up as `ShopifyAdminError`.
 */
export async function ingestShopifyCatalogViaAdmin(siteUrl, shopUrl, adminToken, opts = {}) {
    const maxProducts = opts.maxProducts ?? 5000;
    let cursor = null;
    let ingested = 0;
    let skipped = 0;
    let errored = 0;
    let pagesWalked = 0;
    while (true) {
        let page;
        try {
            page = await adminListProducts(shopUrl, adminToken, cursor, {
                pageSize: opts.pageSize,
                fetchImpl: opts.fetchImpl,
            });
        }
        catch (err) {
            if (err instanceof ShopifyAdminError)
                throw err;
            throw new ShopifyAdminError("network", `Admin catalog ingest failed: ${err.message}`);
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
            }
            catch (err) {
                errored++;
                log.warn({ err, siteUrl, externalId: p.id }, "[Catalog/Admin] upsert failed");
            }
        }
        log.info({ siteUrl, page: pagesWalked, cumulativeIngested: ingested, source: "shopify_admin" }, "[Catalog/Admin] page ingested");
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
function deriveWooAvailability(p) {
    // Store API doesn't expose per-variant inventory; REST v3 returns only
    // variation IDs at the products endpoint. So we map availableForSale at
    // the product level for now. Per-variant inventory is a Phase 1.5
    // enhancement (requires N+1 variation fetch).
    return p.availableForSale ? "in_stock" : "out_of_stock";
}
function sourceFor(credentials) {
    return credentials.kind === "store_api" ? "woocommerce_store" : "woocommerce_rest";
}
export function toWooCatalogInput(siteUrl, p, source) {
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
function isWooIngestable(p) {
    return Boolean(p.id && p.handle && p.title);
}
/**
 * Ingest a WooCommerce site's full catalog into SiteCatalog. Walks the
 * page-number cursor, persisting each page before fetching the next.
 *
 * Errors bubble up as `WooCommerceError` so the wizard can surface kind-tagged
 * messages ("unauthorized" → prompt for new consumer key).
 */
export async function ingestWooCommerceCatalog(siteUrl, shopUrl, credentials, opts = {}) {
    const maxProducts = opts.maxProducts ?? 5000;
    const source = sourceFor(credentials);
    let page = 1;
    let ingested = 0;
    let skipped = 0;
    let errored = 0;
    let pagesWalked = 0;
    while (page !== null) {
        let result;
        try {
            result = await wooListProducts(shopUrl, credentials, page, {
                pageSize: opts.pageSize,
                fetchImpl: opts.fetchImpl,
            });
        }
        catch (err) {
            if (err instanceof WooCommerceError)
                throw err;
            throw new WooCommerceError("network", `Woo catalog ingest failed: ${err.message}`);
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
            }
            catch (err) {
                errored++;
                log.warn({ err, siteUrl, externalId: p.id }, "[Catalog/Woo] upsert failed");
            }
        }
        log.info({ siteUrl, page: pagesWalked, source, cumulativeIngested: ingested, totalCount: result.totalCount }, "[Catalog/Woo] page ingested");
        if (ingested + skipped >= maxProducts) {
            log.warn({ siteUrl, maxProducts }, "[Catalog/Woo] hit maxProducts cap, stopping");
            break;
        }
        page = result.nextPage;
    }
    return { ingested, skipped, errored, pagesWalked, endCursor: page === null ? null : String(page) };
}
export function toGenericCatalogInput(siteUrl, p) {
    return {
        siteUrl,
        externalId: p.externalId,
        handle: p.handle,
        title: p.title,
        description: p.description,
        vendor: null,
        productType: null,
        tags: JSON.stringify([]),
        imageUrl: p.imageUrl,
        url: p.url,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        currency: p.currency || "USD",
        variants: JSON.stringify([]),
        // Codex P1 (Phase 1.5.7): persist "unknown" verbatim — coercing to
        // "in_stock" creates false-positive availability claims for products
        // where the extractor genuinely couldn't tell. Downstream code that
        // filters `availability: "in_stock"` correctly excludes these rows.
        availability: p.availability,
        source: `generic_structured_data:${p.sourceSignal}`,
    };
}
/**
 * Ingest a list of crawled pages, treating any classified as PDP as a
 * product source. Pages where structured-data extraction returns null are
 * counted in `pdpCount` but not in `extractedCount` — coverage tells the
 * wizard how much of the site can be served deterministically. Phase 1.5.2
 * will add an LLM fallback to lift coverage on layouts without structured
 * data.
 */
export async function ingestGenericCatalog(siteUrl, pages, opts = {}) {
    const maxProducts = opts.maxProducts ?? 5000;
    const llmFallback = opts.llmFallback ?? false;
    let ingested = 0;
    let skipped = 0;
    let errored = 0;
    let pdpCount = 0;
    let extractedCount = 0;
    const bySource = { jsonld: 0, microdata: 0, opengraph: 0, llm: 0 };
    for (const page of pages) {
        if (ingested >= maxProducts) {
            log.warn({ siteUrl, maxProducts }, "[Catalog/Generic] hit maxProducts cap, stopping");
            break;
        }
        const pageType = page.pageType
            ?? classifyPage(page.html, page.url).pageType;
        if (pageType !== "pdp")
            continue;
        pdpCount++;
        // First try the deterministic structured-data extractor (1.5.1).
        let product = extractGenericProduct(page.url, page.html);
        // Then, only if structured data was absent AND the LLM fallback is
        // enabled, ask the LLM. The mapper itself enforces feature-flag,
        // per-site cost cap, schema validation, and fallback-to-null.
        if (!product && llmFallback) {
            product = await extractProductWithLLM(page.url, page.html, siteUrl, {
                llmClient: opts.llmClient,
            });
        }
        if (!product) {
            skipped++;
            continue;
        }
        extractedCount++;
        bySource[product.sourceSignal]++;
        try {
            await SiteCatalogRepo.upsertProduct(toGenericCatalogInput(siteUrl, product));
            ingested++;
        }
        catch (err) {
            errored++;
            log.warn({ err, siteUrl, url: page.url }, "[Catalog/Generic] upsert failed");
        }
    }
    const coverage = pdpCount === 0 ? 0 : extractedCount / pdpCount;
    log.info({ siteUrl, pdpCount, extractedCount, coverage: Number(coverage.toFixed(3)), bySource }, "[Catalog/Generic] ingest complete");
    return {
        ingested,
        skipped,
        errored,
        pagesWalked: pages.length,
        endCursor: null,
        pdpCount,
        extractedCount,
        coverage,
        bySource,
    };
}
//# sourceMappingURL=catalog-ingest.service.js.map