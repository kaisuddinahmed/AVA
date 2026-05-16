// ============================================================================
// WooCommerce client — unified module over two transports.
//
// Phase 1.4.1. Mirrors the shape of shopify-storefront/admin clients so the
// catalog-ingest service can speak to either platform via parallel paths.
//
// Transports:
//
//   Store API (public, unauthenticated)
//     GET {base}/wp-json/wc/store/v1/products
//     No auth. Returns user-facing catalog. Limited admin fields
//     (e.g. no stock_quantity), but sufficient for preview ingest.
//
//   REST API v3 (consumer key + secret)
//     GET {base}/wp-json/wc/v3/products
//     Basic auth: base64("{ck}:{cs}"). Exposes inventory, manage_stock,
//     variations metadata, status (publish/draft/private).
//
// Pagination: page-number based with X-WP-Total / X-WP-TotalPages headers.
// We convert to a cursor-like shape so callers can iterate uniformly.
// Zero deps — fetch + base64 only.
// ============================================================================

const STORE_API_PATH = "/wp-json/wc/store/v1/products";
const REST_V3_API_PATH = "/wp-json/wc/v3/products";
const DEFAULT_PAGE_SIZE = 50; // Woo REST max is 100; default lower for safety.

// ---------------------------------------------------------------------------
// Public types — decoupled from raw Woo shape
// ---------------------------------------------------------------------------

export interface WooProduct {
  /** Numeric product ID, surfaced as a string for catalog parity. */
  id: string;
  /** URL slug, e.g. "raw-linen-tee". */
  handle: string;
  title: string;
  description: string | null;
  productType: string | null;       // Woo "type" — simple / variable / grouped / external
  vendor: string | null;            // Woo has no vendor field — always null; kept for parity.
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
  options: { name: string; value: string }[];
}

export interface ListProductsResult {
  products: WooProduct[];
  /** Page-number cursor. null when there are no more pages. */
  nextPage: number | null;
  totalCount: number | null;
}

export type WooErrorKind =
  | "unauthorized"        // 401 — bad consumer key/secret
  | "forbidden"           // 403 — REST API disabled or capability denied
  | "not_found"           // 404 — endpoint missing (Woo not installed?)
  | "rate_limited"        // 429
  | "network"             // fetch threw
  | "malformed_response"; // 2xx with unparseable body

export class WooCommerceError extends Error {
  readonly kind: WooErrorKind;
  readonly status?: number;
  readonly retryAfterSec?: number;

  constructor(kind: WooErrorKind, message: string, opts?: { status?: number; retryAfterSec?: number }) {
    super(message);
    this.name = "WooCommerceError";
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

// ---------------------------------------------------------------------------
// Credentials union — picks the transport
// ---------------------------------------------------------------------------

export type WooCredentials =
  | { kind: "store_api" }
  | { kind: "rest_v3"; consumerKey: string; consumerSecret: string };

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  /** Override the default API path (mostly for testing different Woo majors). */
  apiPath?: string;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildUrl(siteUrl: string, credentials: WooCredentials, opts: { page: number; perPage: number; apiPath?: string }): URL {
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    throw new WooCommerceError("not_found", `Invalid site URL: ${siteUrl}`);
  }
  const path = opts.apiPath
    ?? (credentials.kind === "store_api" ? STORE_API_PATH : REST_V3_API_PATH);
  base.pathname = base.pathname.replace(/\/+$/, "") + path;
  base.searchParams.set("page", String(opts.page));
  base.searchParams.set("per_page", String(opts.perPage));
  return base;
}

function authHeader(credentials: WooCredentials): Record<string, string> {
  if (credentials.kind === "store_api") return {};
  const token = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

interface RawWooImage { src?: string }
interface RawWooCategory { name?: string }
interface RawWooTag { name?: string }
interface RawWooAttribute { name?: string; option?: string; options?: string[] }

interface RawStoreApiProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  short_description?: string;
  type?: string;
  prices?: {
    currency_code?: string;
    price?: string;
    regular_price?: string;
    sale_price?: string;
    price_range?: { min_amount?: string; max_amount?: string };
    currency_minor_unit?: number;
  };
  images?: RawWooImage[];
  categories?: RawWooCategory[];
  tags?: RawWooTag[];
  attributes?: RawWooAttribute[];
  variations?: Array<{ id: number; attributes?: RawWooAttribute[] }>;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
}

interface RawRestV3Product {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  short_description?: string;
  type?: string;
  status?: string;       // publish | draft | pending | private
  price?: string;
  regular_price?: string;
  sale_price?: string;
  images?: RawWooImage[];
  categories?: RawWooCategory[];
  tags?: RawWooTag[];
  attributes?: RawWooAttribute[];
  variations?: number[];
  stock_quantity?: number | null;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  manage_stock?: boolean;
  sku?: string;
  default_attributes?: RawWooAttribute[];
}

/**
 * `minorUnit` tells us the price encoding:
 *   - Store API   → 2 (cents-as-integer string, e.g. "1500" = $15.00)
 *   - REST v3     → 0 (major-unit decimal string, e.g. "15.00" = $15.00)
 * Always trust the hint; never heuristically detect.
 */
function parseAmount(raw: string | undefined | null, minorUnit: number): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (minorUnit > 0) return n / Math.pow(10, minorUnit);
  return n;
}

function normalizeStoreApiProduct(raw: RawStoreApiProduct): WooProduct {
  const minor = raw.prices?.currency_minor_unit ?? 2;
  const min = parseAmount(raw.prices?.price_range?.min_amount ?? raw.prices?.price, minor);
  const max = parseAmount(raw.prices?.price_range?.max_amount ?? raw.prices?.price, minor);

  const tags = (raw.tags ?? []).map((t) => t.name ?? "").filter(Boolean);
  return {
    id: String(raw.id),
    handle: raw.slug,
    title: raw.name,
    description: raw.description || raw.short_description || null,
    productType: raw.type ?? null,
    vendor: null,
    tags,
    availableForSale: Boolean(raw.is_in_stock && raw.is_purchasable !== false),
    onlineStoreUrl: raw.permalink ?? null,
    imageUrl: raw.images?.[0]?.src ?? null,
    priceMin: min,
    priceMax: max,
    currency: raw.prices?.currency_code ?? "USD",
    // Store API only exposes variation IDs + attributes — no prices/sku.
    // Keep stubs so downstream callers see consistent shape.
    variants: (raw.variations ?? []).map((v) => ({
      id: String(v.id),
      title: (v.attributes ?? []).map((a) => a.option ?? a.options?.[0] ?? "").filter(Boolean).join(" / "),
      sku: null,
      price: max ?? 0,
      availableForSale: Boolean(raw.is_in_stock),
      quantityAvailable: null,
      options: (v.attributes ?? []).map((a) => ({
        name: a.name ?? "",
        value: a.option ?? a.options?.[0] ?? "",
      })),
    })),
  };
}

function normalizeRestV3Product(raw: RawRestV3Product): WooProduct {
  // REST v3 returns major-unit decimals — pass minor=0 to skip normalization.
  const priceNum = parseAmount(raw.price, 0);
  const regularNum = parseAmount(raw.regular_price, 0);
  // Range emerges from regular vs sale; collapse to single value when product
  // is a 'simple' type.
  const min = priceNum;
  const max = regularNum ?? priceNum;

  const tags = (raw.tags ?? []).map((t) => t.name ?? "").filter(Boolean);
  const available =
    raw.status === "publish" &&
    (raw.stock_status ?? "instock") !== "outofstock";

  return {
    id: String(raw.id),
    handle: raw.slug,
    title: raw.name,
    description: raw.description || raw.short_description || null,
    productType: raw.type ?? null,
    vendor: null,
    tags,
    availableForSale: available,
    onlineStoreUrl: raw.permalink ?? null,
    imageUrl: raw.images?.[0]?.src ?? null,
    priceMin: min,
    priceMax: max,
    currency: "USD", // Currency requires /system_status; deferred to Phase 1.4.2 caller.
    variants: (raw.variations ?? []).map((id) => ({
      id: String(id),
      title: "",
      sku: null,
      price: priceNum ?? 0,
      availableForSale: available,
      quantityAvailable: null,
      options: [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

async function fetchProductsPage(
  siteUrl: string,
  credentials: WooCredentials,
  page: number,
  pageSize: number,
  fetchImpl: typeof fetch,
  apiPath?: string,
): Promise<{ raw: unknown[]; totalPages: number | null; total: number | null }> {
  const url = buildUrl(siteUrl, credentials, { page, perPage: pageSize, apiPath });

  let resp: Response;
  try {
    resp = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeader(credentials),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WooCommerceError("network", `Woo request failed: ${msg}`);
  }

  if (resp.status === 401) throw new WooCommerceError("unauthorized", "Bad consumer key/secret", { status: 401 });
  if (resp.status === 403) throw new WooCommerceError("forbidden", "WooCommerce REST API forbidden", { status: 403 });
  if (resp.status === 404) throw new WooCommerceError("not_found", "WooCommerce endpoint not found — site may not run Woo", { status: 404 });
  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("retry-after") ?? "2");
    throw new WooCommerceError("rate_limited", "Woo rate limit hit", { status: 429, retryAfterSec: retryAfter });
  }
  if (resp.status >= 400) {
    throw new WooCommerceError("network", `Woo returned HTTP ${resp.status}`, { status: resp.status });
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    throw new WooCommerceError("malformed_response", "Woo response was not JSON", { status: resp.status });
  }
  if (!Array.isArray(body)) {
    throw new WooCommerceError("malformed_response", "Woo response was not an array");
  }

  const totalPages = Number(resp.headers.get("x-wp-totalpages") ?? "");
  const total = Number(resp.headers.get("x-wp-total") ?? "");
  return {
    raw: body,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null,
    total: Number.isFinite(total) && total >= 0 ? total : null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch one page of products from a WooCommerce site. Returns a normalized
 * `WooProduct[]` plus a `nextPage` cursor (null when at end).
 */
export async function listProducts(
  siteUrl: string,
  credentials: WooCredentials,
  page = 1,
  opts?: { pageSize?: number } & ClientOptions,
): Promise<ListProductsResult> {
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new WooCommerceError("network", "fetch is not available in this runtime");
  }
  const pageSize = Math.min(Math.max(opts?.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);

  const { raw, totalPages, total } = await fetchProductsPage(
    siteUrl, credentials, page, pageSize, fetchImpl, opts?.apiPath,
  );

  const normalize = credentials.kind === "store_api"
    ? (r: unknown) => normalizeStoreApiProduct(r as RawStoreApiProduct)
    : (r: unknown) => normalizeRestV3Product(r as RawRestV3Product);

  const products = raw.map(normalize);

  // Compute nextPage. If we got a full page AND totalPages tells us there's
  // more, advance. Without totalPages, fall back to "is this page full?".
  let nextPage: number | null = null;
  if (totalPages != null) {
    nextPage = page < totalPages ? page + 1 : null;
  } else if (products.length === pageSize) {
    nextPage = page + 1;
  }

  return { products, nextPage, totalCount: total };
}

/**
 * Drain every page of products, capped at `maxProducts` for safety.
 */
export async function listAllProducts(
  siteUrl: string,
  credentials: WooCredentials,
  opts?: { pageSize?: number; maxProducts?: number } & ClientOptions,
): Promise<WooProduct[]> {
  const maxProducts = opts?.maxProducts ?? 5000;
  const all: WooProduct[] = [];
  let page: number | null = 1;
  while (page !== null) {
    const result = await listProducts(siteUrl, credentials, page, opts);
    all.push(...result.products);
    if (all.length >= maxProducts) break;
    page = result.nextPage;
  }
  return all.slice(0, maxProducts);
}
