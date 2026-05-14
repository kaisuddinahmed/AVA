// ============================================================================
// Shopify Storefront API client — public-token (no OAuth) product fetcher.
//
// Phase 1.1.2. OAuth (Admin API) lands in Phase 1.3.
//
// Storefront API is GraphQL over HTTPS, called via global `fetch`. We hold
// no SDK dependency — the schema we touch is small and stable.
//
// Endpoint: https://{shop}.myshopify.com/api/{API_VERSION}/graphql.json
// Auth    : X-Shopify-Storefront-Access-Token header
// Errors  : ShopifyStorefrontError with `kind` so callers can branch (the
//           wizard re-prompts for token on `unauthorized`).
// ============================================================================
// Pin a versioned endpoint. The version is API-stable for 12 months by
// Shopify policy. Bump deliberately during quarterly review.
const API_VERSION = "2024-10";
// Shopify Storefront limit on `first` is 250. We default lower for safety.
const DEFAULT_PAGE_SIZE = 50;
export class ShopifyStorefrontError extends Error {
    kind;
    status;
    retryAfterSec;
    constructor(kind, message, opts) {
        super(message);
        this.name = "ShopifyStorefrontError";
        this.kind = kind;
        this.status = opts?.status;
        this.retryAfterSec = opts?.retryAfterSec;
    }
}
/** Resolve the GraphQL endpoint URL for a shop. Accepts host or full URL. */
function buildEndpoint(shopUrl, apiVersion) {
    let host;
    try {
        host = new URL(shopUrl).hostname;
    }
    catch {
        // Caller passed a bare hostname like "example.myshopify.com"
        host = shopUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
    if (!host) {
        throw new ShopifyStorefrontError("not_found", `Invalid shop URL: ${shopUrl}`);
    }
    return `https://${host}/api/${apiVersion}/graphql.json`;
}
async function postGraphQL(endpoint, token, query, variables, fetchImpl) {
    let resp;
    try {
        resp = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Shopify-Storefront-Access-Token": token,
            },
            body: JSON.stringify({ query, variables }),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ShopifyStorefrontError("network", `Storefront API request failed: ${msg}`);
    }
    if (resp.status === 401) {
        throw new ShopifyStorefrontError("unauthorized", "Invalid or expired Storefront access token", { status: 401 });
    }
    if (resp.status === 403) {
        throw new ShopifyStorefrontError("forbidden", "Token lacks required Storefront API access scopes", { status: 403 });
    }
    if (resp.status === 404) {
        throw new ShopifyStorefrontError("not_found", "Shop not found at this URL", { status: 404 });
    }
    if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("retry-after") ?? "1");
        throw new ShopifyStorefrontError("rate_limited", "Storefront API rate limit hit", { status: 429, retryAfterSec: retryAfter });
    }
    let payload;
    try {
        payload = await resp.json();
    }
    catch {
        throw new ShopifyStorefrontError("malformed_response", `Storefront API returned non-JSON body (status ${resp.status})`, { status: resp.status });
    }
    if (payload.errors?.length) {
        const msg = payload.errors.map((e) => e.message).join("; ");
        throw new ShopifyStorefrontError("graphql", `Storefront GraphQL error: ${msg}`);
    }
    if (!payload.data) {
        throw new ShopifyStorefrontError("malformed_response", "Storefront API returned no data");
    }
    return payload.data;
}
const LIST_PRODUCTS_QUERY = /* GraphQL */ `
  query ListProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id handle title description productType vendor tags
          availableForSale onlineStoreUrl
          priceRange {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          featuredImage { url altText }
          variants(first: 50) {
            edges {
              node {
                id title sku
                price { amount currencyCode }
                availableForSale quantityAvailable
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  }
`;
// ---------------------------------------------------------------------------
// Transform raw GraphQL → public shape
// ---------------------------------------------------------------------------
function toStorefrontProduct(raw) {
    const priceMin = parseAmount(raw.priceRange.minVariantPrice.amount);
    const priceMax = parseAmount(raw.priceRange.maxVariantPrice.amount);
    return {
        id: raw.id,
        handle: raw.handle,
        title: raw.title,
        description: raw.description,
        productType: raw.productType,
        vendor: raw.vendor,
        tags: raw.tags ?? [],
        availableForSale: raw.availableForSale,
        onlineStoreUrl: raw.onlineStoreUrl,
        imageUrl: raw.featuredImage?.url ?? null,
        priceMin,
        priceMax,
        currency: raw.priceRange.minVariantPrice.currencyCode,
        variants: raw.variants.edges.map((e) => ({
            id: e.node.id,
            title: e.node.title,
            sku: e.node.sku,
            price: parseAmount(e.node.price.amount) ?? 0,
            availableForSale: e.node.availableForSale,
            quantityAvailable: e.node.quantityAvailable,
            options: e.node.selectedOptions ?? [],
        })),
    };
}
function parseAmount(raw) {
    if (raw == null)
        return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
export async function listProducts(shopUrl, token, cursor, opts) {
    const apiVersion = opts?.apiVersion ?? API_VERSION;
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    const pageSize = Math.min(Math.max(opts?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 250);
    if (typeof fetchImpl !== "function") {
        throw new ShopifyStorefrontError("network", "fetch is not available in this runtime");
    }
    const endpoint = buildEndpoint(shopUrl, apiVersion);
    const data = await postGraphQL(endpoint, token, LIST_PRODUCTS_QUERY, { first: pageSize, after: cursor ?? null }, fetchImpl);
    return {
        products: data.products.edges.map((e) => toStorefrontProduct(e.node)),
        pageInfo: data.products.pageInfo,
    };
}
/**
 * Convenience: drain all pages and return the full product list. Use this
 * when the catalog is small; for large catalogs prefer iterating
 * `listProducts` and persisting each page as it arrives.
 */
export async function listAllProducts(shopUrl, token, opts) {
    const maxProducts = opts?.maxProducts ?? 5000; // safety cap
    const all = [];
    let cursor = null;
    do {
        const page = await listProducts(shopUrl, token, cursor, opts);
        all.push(...page.products);
        if (!page.pageInfo.hasNextPage || all.length >= maxProducts)
            break;
        cursor = page.pageInfo.endCursor;
    } while (cursor);
    return all.slice(0, maxProducts);
}
//# sourceMappingURL=shopify-storefront.client.js.map