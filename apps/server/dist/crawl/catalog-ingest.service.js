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
//# sourceMappingURL=catalog-ingest.service.js.map