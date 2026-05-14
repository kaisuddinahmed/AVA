export interface StorefrontProduct {
    /** Shopify product GID, e.g. "gid://shopify/Product/1234567890" */
    id: string;
    /** URL slug — "raw-linen-tee" */
    handle: string;
    title: string;
    description: string | null;
    productType: string | null;
    vendor: string | null;
    tags: string[];
    availableForSale: boolean;
    onlineStoreUrl: string | null;
    /** Display image URL, null if no featured image */
    imageUrl: string | null;
    priceMin: number | null;
    priceMax: number | null;
    currency: string;
    variants: StorefrontVariant[];
}
export interface StorefrontVariant {
    id: string;
    title: string;
    sku: string | null;
    price: number;
    availableForSale: boolean;
    quantityAvailable: number | null;
    options: {
        name: string;
        value: string;
    }[];
}
export interface ListProductsResult {
    products: StorefrontProduct[];
    pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
    };
}
export type StorefrontErrorKind = "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "graphql" | "network" | "malformed_response";
export declare class ShopifyStorefrontError extends Error {
    readonly kind: StorefrontErrorKind;
    readonly status?: number;
    readonly retryAfterSec?: number;
    constructor(kind: StorefrontErrorKind, message: string, opts?: {
        status?: number;
        retryAfterSec?: number;
    });
}
interface ClientOptions {
    /** Override the global fetch — used by tests. */
    fetchImpl?: typeof fetch;
    /** Override the API version. Defaults to the pinned constant. */
    apiVersion?: string;
}
/**
 * Fetch one page of products from a Shopify Storefront API.
 *
 * @param shopUrl  Either `https://example.myshopify.com` or `example.myshopify.com`
 *                 (custom domains also work — Storefront API responds on the
 *                 same hostname for both myshopify and primary domains).
 * @param token    Public Storefront access token (generated in Shopify admin).
 * @param cursor   Pass `endCursor` from the previous page to paginate.
 * @param opts     Optional: page size (default 50, max 250), fetch override.
 */
export declare function listProducts(shopUrl: string, token: string, cursor?: string | null, opts?: {
    pageSize?: number;
} & ClientOptions): Promise<ListProductsResult>;
/**
 * Convenience: drain all pages and return the full product list. Use this
 * when the catalog is small; for large catalogs prefer iterating
 * `listProducts` and persisting each page as it arrives.
 */
export declare function listAllProducts(shopUrl: string, token: string, opts?: {
    pageSize?: number;
    maxProducts?: number;
} & ClientOptions): Promise<StorefrontProduct[]>;
export {};
//# sourceMappingURL=shopify-storefront.client.d.ts.map