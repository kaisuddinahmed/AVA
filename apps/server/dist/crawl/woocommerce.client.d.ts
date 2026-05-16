export interface WooProduct {
    /** Numeric product ID, surfaced as a string for catalog parity. */
    id: string;
    /** URL slug, e.g. "raw-linen-tee". */
    handle: string;
    title: string;
    description: string | null;
    productType: string | null;
    vendor: string | null;
    tags: string[];
    /** Composite availability — true if the product is purchasable + in stock. */
    availableForSale: boolean;
    /** Permalink to the product page. */
    onlineStoreUrl: string | null;
    imageUrl: string | null;
    priceMin: number | null;
    priceMax: number | null;
    currency: string;
    variants: WooVariant[];
}
export interface WooVariant {
    id: string;
    title: string;
    sku: string | null;
    price: number;
    availableForSale: boolean;
    /** REST v3 exposes stock_quantity; Store API does not — null in that case. */
    quantityAvailable: number | null;
    options: {
        name: string;
        value: string;
    }[];
}
export interface ListProductsResult {
    products: WooProduct[];
    /** Page-number cursor. null when there are no more pages. */
    nextPage: number | null;
    totalCount: number | null;
}
export type WooErrorKind = "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "network" | "malformed_response";
export declare class WooCommerceError extends Error {
    readonly kind: WooErrorKind;
    readonly status?: number;
    readonly retryAfterSec?: number;
    constructor(kind: WooErrorKind, message: string, opts?: {
        status?: number;
        retryAfterSec?: number;
    });
}
export type WooCredentials = {
    kind: "store_api";
} | {
    kind: "rest_v3";
    consumerKey: string;
    consumerSecret: string;
};
export interface ClientOptions {
    fetchImpl?: typeof fetch;
    /** Override the default API path (mostly for testing different Woo majors). */
    apiPath?: string;
}
/**
 * Fetch one page of products from a WooCommerce site. Returns a normalized
 * `WooProduct[]` plus a `nextPage` cursor (null when at end).
 */
export declare function listProducts(siteUrl: string, credentials: WooCredentials, page?: number, opts?: {
    pageSize?: number;
} & ClientOptions): Promise<ListProductsResult>;
/**
 * Drain every page of products, capped at `maxProducts` for safety.
 */
export declare function listAllProducts(siteUrl: string, credentials: WooCredentials, opts?: {
    pageSize?: number;
    maxProducts?: number;
} & ClientOptions): Promise<WooProduct[]>;
//# sourceMappingURL=woocommerce.client.d.ts.map