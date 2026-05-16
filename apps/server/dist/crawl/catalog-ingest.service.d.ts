import { SiteCatalogRepo } from "@ava/db";
import { type StorefrontProduct } from "./shopify-storefront.client.js";
import { type AdminProduct } from "./shopify-admin.client.js";
import { type WooProduct, type WooCredentials } from "./woocommerce.client.js";
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
type UpsertInput = Parameters<typeof SiteCatalogRepo.upsertProduct>[0];
export declare function toCatalogInput(siteUrl: string, p: StorefrontProduct): UpsertInput;
/**
 * Persist a batch of Storefront products to SiteCatalog. Per-product failures
 * are isolated — they increment `errored` but don't halt the batch.
 */
export declare function ingestProducts(siteUrl: string, products: StorefrontProduct[]): Promise<{
    ingested: number;
    skipped: number;
    errored: number;
}>;
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
export declare function ingestShopifyCatalog(siteUrl: string, shopUrl: string, token: string, opts?: IngestOptions): Promise<IngestResult>;
export declare function toAdminCatalogInput(siteUrl: string, p: AdminProduct): UpsertInput;
/**
 * Ingest a Shopify shop's catalog via the Admin API when the Storefront path
 * isn't available. Same pagination + bounded-memory shape as
 * `ingestShopifyCatalog`. Errors bubble up as `ShopifyAdminError`.
 */
export declare function ingestShopifyCatalogViaAdmin(siteUrl: string, shopUrl: string, adminToken: string, opts?: IngestOptions): Promise<IngestResult>;
export declare function toWooCatalogInput(siteUrl: string, p: WooProduct, source: "woocommerce_store" | "woocommerce_rest"): UpsertInput;
/**
 * Ingest a WooCommerce site's full catalog into SiteCatalog. Walks the
 * page-number cursor, persisting each page before fetching the next.
 *
 * Errors bubble up as `WooCommerceError` so the wizard can surface kind-tagged
 * messages ("unauthorized" → prompt for new consumer key).
 */
export declare function ingestWooCommerceCatalog(siteUrl: string, shopUrl: string, credentials: WooCredentials, opts?: IngestOptions): Promise<IngestResult>;
export {};
//# sourceMappingURL=catalog-ingest.service.d.ts.map