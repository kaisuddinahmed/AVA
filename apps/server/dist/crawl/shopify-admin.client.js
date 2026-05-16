// ============================================================================
// Shopify Admin API client — GraphQL over Admin endpoint with OAuth tokens.
//
// Phase 1.3.1. Companion to shopify-storefront.client.ts (Phase 1.1.2).
// Storefront API is public + token-restricted; Admin API is OAuth-scoped
// and exposes inventory, customer data, theme metadata, webhook subs, etc.
//
// We only use Admin for what Storefront can't give us:
//   - Real inventory levels (Storefront exposes quantityAvailable only when
//     `inventoryPolicy = continue`)
//   - Theme metadata for selector library matching
//   - Webhook + ScriptTag administration (added in 1.3.4/1.3.5)
//   - Delegated Storefront token creation (1.3.2)
//
// Zero deps. Same error taxonomy as ShopifyStorefrontError so callers can
// branch on `.kind` uniformly across the two clients.
// ============================================================================
const API_VERSION = "2024-10";
const DEFAULT_PAGE_SIZE = 50; // Admin API hard cap on `first` is 250.
export class ShopifyAdminError extends Error {
    kind;
    status;
    retryAfterSec;
    constructor(kind, message, opts) {
        super(message);
        this.name = "ShopifyAdminError";
        this.kind = kind;
        this.status = opts?.status;
        this.retryAfterSec = opts?.retryAfterSec;
    }
}
function buildEndpoint(shopUrl, apiVersion) {
    let host;
    try {
        host = new URL(shopUrl).hostname;
    }
    catch {
        host = shopUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
    if (!host) {
        throw new ShopifyAdminError("not_found", `Invalid shop URL: ${shopUrl}`);
    }
    return `https://${host}/admin/api/${apiVersion}/graphql.json`;
}
async function postGraphQL(endpoint, token, query, variables, fetchImpl) {
    let resp;
    try {
        resp = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({ query, variables }),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ShopifyAdminError("network", `Admin API request failed: ${msg}`);
    }
    if (resp.status === 401) {
        throw new ShopifyAdminError("unauthorized", "Invalid or expired Admin access token", { status: 401 });
    }
    if (resp.status === 403) {
        throw new ShopifyAdminError("forbidden", "Admin token lacks the requested scopes", { status: 403 });
    }
    if (resp.status === 404) {
        throw new ShopifyAdminError("not_found", "Shop or API path not found", { status: 404 });
    }
    if (resp.status === 423) {
        // Shopify uses 423 LOCKED to signal a frozen shop (e.g. fraud check)
        throw new ShopifyAdminError("forbidden", "Shop is locked by Shopify", { status: 423 });
    }
    if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("retry-after") ?? "2");
        throw new ShopifyAdminError("rate_limited", "Admin API rate limit hit", { status: 429, retryAfterSec: retryAfter });
    }
    let payload;
    try {
        payload = await resp.json();
    }
    catch {
        throw new ShopifyAdminError("malformed_response", `Admin API returned non-JSON body (status ${resp.status})`, { status: resp.status });
    }
    if (payload.errors?.length) {
        const msg = payload.errors.map((e) => e.message).join("; ");
        throw new ShopifyAdminError("graphql", `Admin GraphQL error: ${msg}`);
    }
    if (!payload.data) {
        throw new ShopifyAdminError("malformed_response", "Admin API returned no data");
    }
    return payload.data;
}
const LIST_PRODUCTS_QUERY = /* GraphQL */ `
  query AdminListProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id handle title description productType vendor tags status
          totalInventory onlineStoreUrl
          featuredImage { url }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          variants(first: 50) {
            edges {
              node {
                id title sku price
                inventoryQuantity inventoryPolicy
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
// Transform
// ---------------------------------------------------------------------------
function parseAmount(raw) {
    if (raw == null)
        return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}
function toAdminProduct(raw) {
    return {
        id: raw.id,
        handle: raw.handle,
        title: raw.title,
        description: raw.description,
        productType: raw.productType,
        vendor: raw.vendor,
        tags: raw.tags ?? [],
        status: raw.status,
        totalInventory: raw.totalInventory,
        onlineStoreUrl: raw.onlineStoreUrl,
        imageUrl: raw.featuredImage?.url ?? null,
        priceMin: parseAmount(raw.priceRangeV2.minVariantPrice.amount),
        priceMax: parseAmount(raw.priceRangeV2.maxVariantPrice.amount),
        currency: raw.priceRangeV2.minVariantPrice.currencyCode,
        variants: raw.variants.edges.map((e) => ({
            id: e.node.id,
            title: e.node.title,
            sku: e.node.sku,
            price: parseAmount(e.node.price) ?? 0,
            inventoryQuantity: e.node.inventoryQuantity,
            inventoryPolicy: e.node.inventoryPolicy,
            options: e.node.selectedOptions ?? [],
        })),
    };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Fetch one page of products via the Admin API. Use this when you need
 * accurate inventory levels (Storefront API can't always provide them).
 */
export async function listProducts(shopUrl, adminToken, cursor, opts) {
    const apiVersion = opts?.apiVersion ?? API_VERSION;
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    const pageSize = Math.min(Math.max(opts?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 250);
    if (typeof fetchImpl !== "function") {
        throw new ShopifyAdminError("network", "fetch is not available in this runtime");
    }
    const endpoint = buildEndpoint(shopUrl, apiVersion);
    const data = await postGraphQL(endpoint, adminToken, LIST_PRODUCTS_QUERY, { first: pageSize, after: cursor ?? null }, fetchImpl);
    return {
        products: data.products.edges.map((e) => toAdminProduct(e.node)),
        pageInfo: data.products.pageInfo,
    };
}
/**
 * Drain all pages. Same safety cap pattern as the Storefront client —
 * prefer iterating `listProducts` page-by-page for large catalogs.
 */
export async function listAllProducts(shopUrl, adminToken, opts) {
    const maxProducts = opts?.maxProducts ?? 5000;
    const all = [];
    let cursor = null;
    do {
        const page = await listProducts(shopUrl, adminToken, cursor, opts);
        all.push(...page.products);
        if (!page.pageInfo.hasNextPage || all.length >= maxProducts)
            break;
        cursor = page.pageInfo.endCursor;
    } while (cursor);
    return all.slice(0, maxProducts);
}
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
export async function createDelegatedStorefrontToken(shopUrl, adminToken, title, opts) {
    const apiVersion = opts?.apiVersion ?? API_VERSION;
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        throw new ShopifyAdminError("network", "fetch is not available in this runtime");
    }
    const endpoint = buildEndpoint(shopUrl, apiVersion);
    const data = await postGraphQL(endpoint, adminToken, 
    /* GraphQL */ `
      mutation StorefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
        storefrontAccessTokenCreate(input: $input) {
          storefrontAccessToken {
            accessToken
            title
            accessScopes { handle }
          }
          userErrors { field message }
        }
      }
    `, { input: { title } }, fetchImpl);
    const result = data.storefrontAccessTokenCreate;
    if (result.userErrors.length > 0) {
        const msg = result.userErrors.map((e) => e.message).join("; ");
        throw new ShopifyAdminError("graphql", `storefrontAccessTokenCreate failed: ${msg}`);
    }
    if (!result.storefrontAccessToken) {
        throw new ShopifyAdminError("malformed_response", "storefrontAccessTokenCreate returned no token");
    }
    return {
        accessToken: result.storefrontAccessToken.accessToken,
        title: result.storefrontAccessToken.title,
        scopes: result.storefrontAccessToken.accessScopes.map((s) => s.handle),
    };
}
/**
 * Fetch the shop's primary domain + currency + theme name. Used by
 * Phase 1.3.3 to enrich the wizard preview and Phase 1.5 to pick the
 * right theme-aware selector library.
 */
export async function getShopInfo(shopUrl, adminToken, opts) {
    const apiVersion = opts?.apiVersion ?? API_VERSION;
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        throw new ShopifyAdminError("network", "fetch is not available in this runtime");
    }
    const endpoint = buildEndpoint(shopUrl, apiVersion);
    const data = await postGraphQL(endpoint, adminToken, 
    /* GraphQL */ `
      query AdminShopInfo {
        shop {
          name
          primaryDomain { url }
          currencyCode
        }
        themes(first: 5, roles: [MAIN]) {
          edges { node { name role } }
        }
      }
    `, {}, fetchImpl);
    const mainTheme = data.themes.edges.find((e) => e.node.role === "MAIN")?.node.name ?? null;
    return {
        name: data.shop.name,
        primaryDomain: data.shop.primaryDomain.url,
        currencyCode: data.shop.currencyCode,
        theme: mainTheme,
    };
}
const WEBHOOK_SUBSCRIPTION_CREATE = /* GraphQL */ `
  mutation WebhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!,
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;
/**
 * `already taken` is Shopify's signal that the (topic, callbackUrl) tuple is
 * already subscribed for this shop. We treat it as success since the goal —
 * "this topic delivers to our endpoint" — is satisfied.
 */
function isAlreadyExistsError(msg) {
    return /already.*(taken|exists|subscribed)/i.test(msg);
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
export async function registerProductWebhooks(shopUrl, adminToken, callbackBaseUrl, opts) {
    const apiVersion = opts?.apiVersion ?? API_VERSION;
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        throw new ShopifyAdminError("network", "fetch is not available in this runtime");
    }
    const endpoint = buildEndpoint(shopUrl, apiVersion);
    // Strip trailing slash so we don't double-slash callback URLs.
    const base = callbackBaseUrl.replace(/\/+$/, "");
    const topics = [
        { topic: "PRODUCTS_CREATE", path: "/api/shopify/webhooks/products/create" },
        { topic: "PRODUCTS_UPDATE", path: "/api/shopify/webhooks/products/update" },
        { topic: "PRODUCTS_DELETE", path: "/api/shopify/webhooks/products/delete" },
    ];
    const registered = [];
    const failed = [];
    for (const { topic, path } of topics) {
        const uri = `${base}${path}`;
        try {
            // WebhookSubscriptionInput.uri (NOT callbackUrl) is the current field for
            // HTTPS endpoints in the 2024-10 Admin GraphQL schema. The legacy
            // `callbackUrl` field was removed; sending it returns a GraphQL error.
            const data = await postGraphQL(endpoint, adminToken, WEBHOOK_SUBSCRIPTION_CREATE, {
                topic,
                webhookSubscription: { uri, format: "JSON" },
            }, fetchImpl);
            const result = data.webhookSubscriptionCreate;
            if (result.webhookSubscription) {
                registered.push({ topic, id: result.webhookSubscription.id, alreadyExisted: false });
                continue;
            }
            const errMsg = result.userErrors.map((e) => e.message).join("; ");
            if (result.userErrors.length > 0 && isAlreadyExistsError(errMsg)) {
                // Already subscribed — treat as success with empty ID (Shopify doesn't echo it back here).
                registered.push({ topic, id: "", alreadyExisted: true });
                continue;
            }
            failed.push({ topic, reason: errMsg || "Unknown webhookSubscriptionCreate failure" });
        }
        catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            failed.push({ topic, reason });
        }
    }
    return { registered, failed };
}
//# sourceMappingURL=shopify-admin.client.js.map