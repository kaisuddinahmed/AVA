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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
  options: { name: string; value: string }[];
}

export interface ListProductsResult {
  products: AdminProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export type AdminErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "graphql"
  | "network"
  | "malformed_response";

export class ShopifyAdminError extends Error {
  readonly kind: AdminErrorKind;
  readonly status?: number;
  readonly retryAfterSec?: number;

  constructor(kind: AdminErrorKind, message: string, opts?: { status?: number; retryAfterSec?: number }) {
    super(message);
    this.name = "ShopifyAdminError";
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

// ---------------------------------------------------------------------------
// Internal — request plumbing
// ---------------------------------------------------------------------------

interface ClientOptions {
  fetchImpl?: typeof fetch;
  apiVersion?: string;
}

function buildEndpoint(shopUrl: string, apiVersion: string): string {
  let host: string;
  try {
    host = new URL(shopUrl).hostname;
  } catch {
    host = shopUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
  if (!host) {
    throw new ShopifyAdminError("not_found", `Invalid shop URL: ${shopUrl}`);
  }
  return `https://${host}/admin/api/${apiVersion}/graphql.json`;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

async function postGraphQL<T>(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<T> {
  let resp: Response;
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
  } catch (err) {
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

  let payload: GraphQLResponse<T>;
  try {
    payload = await resp.json() as GraphQLResponse<T>;
  } catch {
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

// ---------------------------------------------------------------------------
// Raw GraphQL shape (internal) — mirrors the query in LIST_PRODUCTS_QUERY
// ---------------------------------------------------------------------------

interface RawListProductsData {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{
      node: {
        id: string;
        handle: string;
        title: string;
        description: string | null;
        productType: string | null;
        vendor: string | null;
        tags: string[];
        status: "ACTIVE" | "ARCHIVED" | "DRAFT";
        totalInventory: number | null;
        onlineStoreUrl: string | null;
        featuredImage: { url: string } | null;
        priceRangeV2: {
          minVariantPrice: { amount: string; currencyCode: string };
          maxVariantPrice: { amount: string; currencyCode: string };
        };
        variants: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              sku: string | null;
              price: string;
              inventoryQuantity: number | null;
              inventoryPolicy: "CONTINUE" | "DENY";
              selectedOptions: Array<{ name: string; value: string }>;
            };
          }>;
        };
      };
    }>;
  };
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

function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toAdminProduct(raw: RawListProductsData["products"]["edges"][number]["node"]): AdminProduct {
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
export async function listProducts(
  shopUrl: string,
  adminToken: string,
  cursor?: string | null,
  opts?: { pageSize?: number } & ClientOptions,
): Promise<ListProductsResult> {
  const apiVersion = opts?.apiVersion ?? API_VERSION;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  const pageSize = Math.min(Math.max(opts?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 250);

  if (typeof fetchImpl !== "function") {
    throw new ShopifyAdminError("network", "fetch is not available in this runtime");
  }

  const endpoint = buildEndpoint(shopUrl, apiVersion);
  const data = await postGraphQL<RawListProductsData>(
    endpoint,
    adminToken,
    LIST_PRODUCTS_QUERY,
    { first: pageSize, after: cursor ?? null },
    fetchImpl,
  );

  return {
    products: data.products.edges.map((e) => toAdminProduct(e.node)),
    pageInfo: data.products.pageInfo,
  };
}

/**
 * Drain all pages. Same safety cap pattern as the Storefront client —
 * prefer iterating `listProducts` page-by-page for large catalogs.
 */
export async function listAllProducts(
  shopUrl: string,
  adminToken: string,
  opts?: { pageSize?: number; maxProducts?: number } & ClientOptions,
): Promise<AdminProduct[]> {
  const maxProducts = opts?.maxProducts ?? 5000;
  const all: AdminProduct[] = [];
  let cursor: string | null = null;
  do {
    const page = await listProducts(shopUrl, adminToken, cursor, opts);
    all.push(...page.products);
    if (!page.pageInfo.hasNextPage || all.length >= maxProducts) break;
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
export async function createDelegatedStorefrontToken(
  shopUrl: string,
  adminToken: string,
  title: string,
  opts?: ClientOptions,
): Promise<{ accessToken: string; title: string; scopes: string[] }> {
  const apiVersion = opts?.apiVersion ?? API_VERSION;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ShopifyAdminError("network", "fetch is not available in this runtime");
  }

  const endpoint = buildEndpoint(shopUrl, apiVersion);
  const data = await postGraphQL<{
    storefrontAccessTokenCreate: {
      storefrontAccessToken: {
        accessToken: string;
        title: string;
        accessScopes: Array<{ handle: string }>;
      } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    endpoint,
    adminToken,
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
    `,
    { input: { title } },
    fetchImpl,
  );

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
export async function getShopInfo(
  shopUrl: string,
  adminToken: string,
  opts?: ClientOptions,
): Promise<{ name: string; primaryDomain: string; currencyCode: string; theme: string | null }> {
  const apiVersion = opts?.apiVersion ?? API_VERSION;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ShopifyAdminError("network", "fetch is not available in this runtime");
  }

  const endpoint = buildEndpoint(shopUrl, apiVersion);
  const data = await postGraphQL<{
    shop: {
      name: string;
      primaryDomain: { url: string };
      currencyCode: string;
    };
    themes: { edges: Array<{ node: { name: string; role: string } }> };
  }>(
    endpoint,
    adminToken,
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
    `,
    {},
    fetchImpl,
  );

  const mainTheme = data.themes.edges.find((e) => e.node.role === "MAIN")?.node.name ?? null;
  return {
    name: data.shop.name,
    primaryDomain: data.shop.primaryDomain.url,
    currencyCode: data.shop.currencyCode,
    theme: mainTheme,
  };
}

// ---------------------------------------------------------------------------
// Webhook subscription registration (Phase 1.3.5)
// ---------------------------------------------------------------------------

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
  failed: Array<{ topic: ProductWebhookTopic; reason: string }>;
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

interface WebhookSubscriptionCreateData {
  webhookSubscriptionCreate: {
    webhookSubscription: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

/**
 * `already taken` is Shopify's signal that the (topic, callbackUrl) tuple is
 * already subscribed for this shop. We treat it as success since the goal —
 * "this topic delivers to our endpoint" — is satisfied.
 */
function isAlreadyExistsError(msg: string): boolean {
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
export async function registerProductWebhooks(
  shopUrl: string,
  adminToken: string,
  callbackBaseUrl: string,
  opts?: ClientOptions,
): Promise<RegisterProductWebhooksResult> {
  const apiVersion = opts?.apiVersion ?? API_VERSION;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ShopifyAdminError("network", "fetch is not available in this runtime");
  }
  const endpoint = buildEndpoint(shopUrl, apiVersion);

  // Strip trailing slash so we don't double-slash callback URLs.
  const base = callbackBaseUrl.replace(/\/+$/, "");
  const topics: Array<{ topic: ProductWebhookTopic; path: string }> = [
    { topic: "PRODUCTS_CREATE", path: "/api/shopify/webhooks/products/create" },
    { topic: "PRODUCTS_UPDATE", path: "/api/shopify/webhooks/products/update" },
    { topic: "PRODUCTS_DELETE", path: "/api/shopify/webhooks/products/delete" },
  ];

  const registered: RegisteredWebhook[] = [];
  const failed: Array<{ topic: ProductWebhookTopic; reason: string }> = [];

  for (const { topic, path } of topics) {
    const uri = `${base}${path}`;
    try {
      // WebhookSubscriptionInput.uri (NOT callbackUrl) is the current field for
      // HTTPS endpoints in the 2024-10 Admin GraphQL schema. The legacy
      // `callbackUrl` field was removed; sending it returns a GraphQL error.
      const data = await postGraphQL<WebhookSubscriptionCreateData>(
        endpoint,
        adminToken,
        WEBHOOK_SUBSCRIPTION_CREATE,
        {
          topic,
          webhookSubscription: { uri, format: "JSON" },
        },
        fetchImpl,
      );
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ topic, reason });
    }
  }

  return { registered, failed };
}
