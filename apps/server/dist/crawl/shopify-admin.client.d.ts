export interface AdminProduct {
    /** Admin GID, e.g. "gid://shopify/Product/1234" */
    id: string;
    handle: string;
    title: string;
    description: string | null;
    productType: string | null;
    vendor: string | null;
    tags: string[];
    status: "ACTIVE" | "ARCHIVED" | "DRAFT";
    /** Total stock across all variants. Null when inventory tracking is off. */
    totalInventory: number | null;
    onlineStoreUrl: string | null;
    imageUrl: string | null;
    priceMin: number | null;
    priceMax: number | null;
    currency: string;
    variants: AdminVariant[];
}
export interface AdminVariant {
    id: string;
    title: string;
    sku: string | null;
    price: number;
    /** Actual inventory count (Admin API exposes this unconditionally). */
    inventoryQuantity: number | null;
    inventoryPolicy: "CONTINUE" | "DENY";
    options: {
        name: string;
        value: string;
    }[];
}
export interface ListProductsResult {
    products: AdminProduct[];
    pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
    };
}
export type AdminErrorKind = "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "graphql" | "network" | "malformed_response";
export declare class ShopifyAdminError extends Error {
    readonly kind: AdminErrorKind;
    readonly status?: number;
    readonly retryAfterSec?: number;
    constructor(kind: AdminErrorKind, message: string, opts?: {
        status?: number;
        retryAfterSec?: number;
    });
}
interface ClientOptions {
    fetchImpl?: typeof fetch;
    apiVersion?: string;
}
/**
 * Fetch one page of products via the Admin API. Use this when you need
 * accurate inventory levels (Storefront API can't always provide them).
 */
export declare function listProducts(shopUrl: string, adminToken: string, cursor?: string | null, opts?: {
    pageSize?: number;
} & ClientOptions): Promise<ListProductsResult>;
/**
 * Drain all pages. Same safety cap pattern as the Storefront client —
 * prefer iterating `listProducts` page-by-page for large catalogs.
 */
export declare function listAllProducts(shopUrl: string, adminToken: string, opts?: {
    pageSize?: number;
    maxProducts?: number;
} & ClientOptions): Promise<AdminProduct[]>;
/**
 * Mint a delegated Storefront access token via the Admin API. The token
 * inherits whatever unauthenticated Storefront scopes the OAuth app was
 * granted during install — so as long as the install requested
 * `unauthenticated_read_product_listings` (etc.), the delegated token can
 * use them.
 *
 * Phase 1.3.2. Lets the OAuth flow produce BOTH credentials from a single
 * install — Admin for ingest/inventory, Storefront for runtime queries.
 */
export declare function createDelegatedStorefrontToken(shopUrl: string, adminToken: string, title: string, opts?: ClientOptions): Promise<{
    accessToken: string;
    title: string;
    scopes: string[];
}>;
/**
 * Fetch the shop's primary domain + currency + theme name. Used by
 * Phase 1.3.3 to enrich the wizard preview and Phase 1.5 to pick the
 * right theme-aware selector library.
 */
export declare function getShopInfo(shopUrl: string, adminToken: string, opts?: ClientOptions): Promise<{
    name: string;
    primaryDomain: string;
    currencyCode: string;
    theme: string | null;
}>;
/**
 * Shopify Admin webhook topics we subscribe to during OAuth install.
 * The corresponding HTTP handlers live in shopify-webhooks.api.ts.
 */
export type ProductWebhookTopic = "PRODUCTS_CREATE" | "PRODUCTS_UPDATE" | "PRODUCTS_DELETE";
export interface RegisteredWebhook {
    topic: ProductWebhookTopic;
    /** Shopify webhook subscription GID, e.g. "gid://shopify/WebhookSubscription/12345" */
    id: string;
    /** True when the subscription already existed (Shopify returns "already taken"). */
    alreadyExisted: boolean;
}
export interface RegisterProductWebhooksResult {
    registered: RegisteredWebhook[];
    /** Topics that failed for reasons other than already-existing. */
    failed: Array<{
        topic: ProductWebhookTopic;
        reason: string;
    }>;
}
/**
 * Subscribe to products/{create,update,delete} webhooks during OAuth install.
 *
 * Phase 1.3.5. Called from the OAuth callback after token exchange. Failure
 * on one topic does NOT abort the others — partial success is preferable to
 * silently dropping all webhook coverage.
 *
 * Idempotent: re-running after a successful install returns the same shape
 * with `alreadyExisted: true` and no error.
 */
export declare function registerProductWebhooks(shopUrl: string, adminToken: string, callbackBaseUrl: string, opts?: ClientOptions): Promise<RegisterProductWebhooksResult>;
export {};
//# sourceMappingURL=shopify-admin.client.d.ts.map