// ============================================================================
// Catalog ingest service — unit tests with mocked SiteCatalogRepo + fetch.
// Covers transform correctness, availability derivation, pagination, error
// isolation, maxProducts cap, and Storefront error propagation.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorefrontProduct } from "./shopify-storefront.client.js";

// ── Mock @ava/db before importing the service under test ────────────────────

vi.mock("@ava/db", () => ({
  SiteCatalogRepo: {
    upsertProduct: vi.fn(),
  },
}));

import { SiteCatalogRepo } from "@ava/db";
import {
  ingestProducts,
  ingestShopifyCatalog,
  toCatalogInput,
} from "./catalog-ingest.service.js";
import { ShopifyStorefrontError } from "./shopify-storefront.client.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const upsertMock = SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>;

function product(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id: "gid://shopify/Product/1",
    handle: "raw-linen-tee",
    title: "Raw Linen Tee",
    description: "Lightweight raw linen.",
    productType: "Top",
    vendor: "Example Brand",
    tags: ["new"],
    availableForSale: true,
    onlineStoreUrl: "https://example.myshopify.com/products/raw-linen-tee",
    imageUrl: "https://cdn.shopify.com/img.jpg",
    priceMin: 48,
    priceMax: 48,
    currency: "USD",
    variants: [{
      id: "gid://shopify/ProductVariant/11",
      title: "M",
      sku: "RLT-M",
      price: 48,
      availableForSale: true,
      quantityAvailable: 12,
      options: [{ name: "Size", value: "M" }],
    }],
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a Storefront API response body for `listProducts`. */
function storefrontBody(opts: { products: StorefrontProduct[]; hasNext?: boolean; endCursor?: string | null }) {
  return {
    data: {
      products: {
        pageInfo: { hasNextPage: opts.hasNext ?? false, endCursor: opts.endCursor ?? null },
        edges: opts.products.map((p) => ({
          node: {
            id: p.id,
            handle: p.handle,
            title: p.title,
            description: p.description,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            availableForSale: p.availableForSale,
            onlineStoreUrl: p.onlineStoreUrl,
            priceRange: {
              minVariantPrice: { amount: String(p.priceMin ?? 0), currencyCode: p.currency },
              maxVariantPrice: { amount: String(p.priceMax ?? 0), currencyCode: p.currency },
            },
            featuredImage: p.imageUrl ? { url: p.imageUrl, altText: null } : null,
            variants: {
              edges: p.variants.map((v) => ({
                node: {
                  id: v.id,
                  title: v.title,
                  sku: v.sku,
                  price: { amount: String(v.price), currencyCode: p.currency },
                  availableForSale: v.availableForSale,
                  quantityAvailable: v.quantityAvailable,
                  selectedOptions: v.options,
                },
              })),
            },
          },
        })),
      },
    },
  };
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
});

// ── Transform ───────────────────────────────────────────────────────────────

describe("toCatalogInput — transform", () => {
  it("maps Storefront fields onto the SiteCatalog upsert input", () => {
    const input = toCatalogInput("https://example.myshopify.com", product());
    expect(input).toMatchObject({
      siteUrl: "https://example.myshopify.com",
      externalId: "gid://shopify/Product/1",
      handle: "raw-linen-tee",
      title: "Raw Linen Tee",
      vendor: "Example Brand",
      productType: "Top",
      imageUrl: "https://cdn.shopify.com/img.jpg",
      priceMin: 48,
      priceMax: 48,
      currency: "USD",
      availability: "in_stock",
      source: "shopify_storefront",
    });
    expect(JSON.parse(input.tags ?? "[]")).toEqual(["new"]);
    expect(JSON.parse(input.variants)).toHaveLength(1);
  });

  it("defaults currency to USD when blank", () => {
    const input = toCatalogInput("https://x.test", product({ currency: "" }));
    expect(input.currency).toBe("USD");
  });
});

describe("toCatalogInput — availability derivation", () => {
  it("returns 'in_stock' when all variants are available", () => {
    const p = product();
    p.variants[0].availableForSale = true;
    expect(toCatalogInput("x", p).availability).toBe("in_stock");
  });

  it("returns 'out_of_stock' when no variants are available", () => {
    const p = product();
    p.variants[0].availableForSale = false;
    expect(toCatalogInput("x", p).availability).toBe("out_of_stock");
  });

  it("returns 'partial' when some variants are unavailable", () => {
    const p = product();
    p.variants = [
      { ...p.variants[0], id: "v1", availableForSale: true },
      { ...p.variants[0], id: "v2", availableForSale: false },
    ];
    expect(toCatalogInput("x", p).availability).toBe("partial");
  });

  it("falls back to product-level availableForSale when no variants exist", () => {
    const p = product({ variants: [] });
    p.availableForSale = false;
    expect(toCatalogInput("x", p).availability).toBe("out_of_stock");
  });
});

// ── Single-page ingest ──────────────────────────────────────────────────────

describe("ingestProducts — per-page persistence", () => {
  it("upserts every ingestable product", async () => {
    const result = await ingestProducts("https://x.test", [
      product({ id: "p1", handle: "a" }),
      product({ id: "p2", handle: "b" }),
    ]);
    expect(result).toEqual({ ingested: 2, skipped: 0, errored: 0 });
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });

  it("skips products missing required fields without erroring", async () => {
    const result = await ingestProducts("https://x.test", [
      product({ id: "p1", handle: "" }),       // missing handle
      product({ id: "", handle: "b" }),        // missing id
      product({ id: "p3", handle: "c", title: "" }), // missing title
      product({ id: "p4", handle: "d" }),      // valid
    ]);
    expect(result).toEqual({ ingested: 1, skipped: 3, errored: 0 });
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("isolates per-product upsert failures (one bad row doesn't halt the batch)", async () => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValueOnce({});
    upsertMock.mockRejectedValueOnce(new Error("constraint violation"));
    upsertMock.mockResolvedValueOnce({});

    const result = await ingestProducts("https://x.test", [
      product({ id: "p1" }),
      product({ id: "p2" }),
      product({ id: "p3" }),
    ]);
    expect(result).toEqual({ ingested: 2, skipped: 0, errored: 1 });
  });
});

// ── Orchestrator: pagination + caps + error propagation ─────────────────────

describe("ingestShopifyCatalog — pagination", () => {
  it("walks every page and persists products from each before fetching the next", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(storefrontBody({
        products: [product({ id: "p1", handle: "a" }), product({ id: "p2", handle: "b" })],
        hasNext: true, endCursor: "c1",
      })))
      .mockResolvedValueOnce(jsonResponse(storefrontBody({
        products: [product({ id: "p3", handle: "c" })],
        hasNext: false, endCursor: null,
      })));

    const result = await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "tok", {
      fetchImpl: fetchMock, pageSize: 10,
    });

    expect(result.ingested).toBe(3);
    expect(result.pagesWalked).toBe(2);
    expect(result.endCursor).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).variables.after).toBe("c1");
  });
});

describe("ingestShopifyCatalog — caps", () => {
  it("stops at maxProducts even if more pages exist", async () => {
    const body = () => storefrontBody({
      products: Array.from({ length: 10 }, (_, i) => product({ id: `p${i}`, handle: `h${i}` })),
      hasNext: true,
      endCursor: "next",
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(body()));

    const result = await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "tok", {
      fetchImpl: fetchMock, pageSize: 10, maxProducts: 15,
    });

    expect(result.ingested).toBe(15);
    expect(result.endCursor).toBe("next"); // cursor retained so caller can resume
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ingestShopifyCatalog — error propagation", () => {
  it("re-throws ShopifyStorefrontError unchanged so the wizard sees the kind", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 401 }),
    );

    try {
      await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "bad-tok", { fetchImpl: fetchMock });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ShopifyStorefrontError);
      expect((err as ShopifyStorefrontError).kind).toBe("unauthorized");
    }
  });
});

// ── Admin API ingest fallback (Phase 1.3 hardening) ─────────────────────────

import {
  ingestShopifyCatalogViaAdmin,
  toAdminCatalogInput,
} from "./catalog-ingest.service.js";
import { ShopifyAdminError, type AdminProduct } from "./shopify-admin.client.js";

function adminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: "gid://shopify/Product/1",
    handle: "raw-linen-tee",
    title: "Raw Linen Tee",
    description: "Linen.",
    productType: "Top",
    vendor: "Example Brand",
    tags: ["new"],
    status: "ACTIVE",
    totalInventory: 12,
    onlineStoreUrl: "https://example.myshopify.com/products/raw-linen-tee",
    imageUrl: "https://cdn.shopify.com/img.jpg",
    priceMin: 48,
    priceMax: 48,
    currency: "USD",
    variants: [{
      id: "gid://shopify/ProductVariant/11",
      title: "M",
      sku: "RLT-M",
      price: 48,
      inventoryQuantity: 12,
      inventoryPolicy: "DENY",
      options: [{ name: "Size", value: "M" }],
    }],
    ...overrides,
  };
}

function adminBody(opts: { products: AdminProduct[]; hasNext?: boolean; endCursor?: string | null }) {
  return {
    data: {
      products: {
        pageInfo: { hasNextPage: opts.hasNext ?? false, endCursor: opts.endCursor ?? null },
        edges: opts.products.map((p) => ({
          node: {
            id: p.id,
            handle: p.handle,
            title: p.title,
            description: p.description,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            status: p.status,
            totalInventory: p.totalInventory,
            onlineStoreUrl: p.onlineStoreUrl,
            featuredImage: p.imageUrl ? { url: p.imageUrl } : null,
            priceRangeV2: {
              minVariantPrice: { amount: String(p.priceMin ?? 0), currencyCode: p.currency },
              maxVariantPrice: { amount: String(p.priceMax ?? 0), currencyCode: p.currency },
            },
            variants: {
              edges: p.variants.map((v) => ({
                node: {
                  id: v.id,
                  title: v.title,
                  sku: v.sku,
                  price: String(v.price),
                  inventoryQuantity: v.inventoryQuantity,
                  inventoryPolicy: v.inventoryPolicy,
                  selectedOptions: v.options,
                },
              })),
            },
          },
        })),
      },
    },
  };
}

describe("toAdminCatalogInput — AdminProduct → SiteCatalog", () => {
  it("tags upserts with source='shopify_admin' so analytics can distinguish path", () => {
    const input = toAdminCatalogInput("https://x.test", adminProduct());
    expect(input.source).toBe("shopify_admin");
  });

  it("ARCHIVED/DRAFT status forces out_of_stock regardless of inventory", () => {
    expect(toAdminCatalogInput("https://x.test", adminProduct({ status: "ARCHIVED" })).availability)
      .toBe("out_of_stock");
    expect(toAdminCatalogInput("https://x.test", adminProduct({ status: "DRAFT" })).availability)
      .toBe("out_of_stock");
  });

  it("inventoryPolicy=CONTINUE counts variant as available even at quantity 0", () => {
    const p = adminProduct();
    p.variants[0].inventoryQuantity = 0;
    p.variants[0].inventoryPolicy = "CONTINUE";
    expect(toAdminCatalogInput("https://x.test", p).availability).toBe("in_stock");
  });

  it("variants with zero quantity and DENY policy → out_of_stock", () => {
    const p = adminProduct();
    p.variants[0].inventoryQuantity = 0;
    p.variants[0].inventoryPolicy = "DENY";
    expect(toAdminCatalogInput("https://x.test", p).availability).toBe("out_of_stock");
  });
});

describe("ingestShopifyCatalogViaAdmin", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({});
  });

  it("walks pagination and upserts every product on every page", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(adminBody({
        products: [
          adminProduct({ id: "gid://shopify/Product/1", handle: "tee-1" }),
          adminProduct({ id: "gid://shopify/Product/2", handle: "tee-2" }),
        ],
        hasNext: true,
        endCursor: "cursor-1",
      })))
      .mockResolvedValueOnce(jsonResponse(adminBody({
        products: [adminProduct({ id: "gid://shopify/Product/3", handle: "tee-3" })],
        hasNext: false,
      })));

    const result = await ingestShopifyCatalogViaAdmin(
      "https://x.test",
      "https://x.myshopify.com",
      "shpat_admin",
      { fetchImpl: fetchMock },
    );

    expect(result).toMatchObject({
      ingested: 3,
      skipped: 0,
      errored: 0,
      pagesWalked: 2,
      endCursor: null,
    });
    expect(upsertMock).toHaveBeenCalledTimes(3);
    // All upserts carry the Admin source tag so SiteCatalog rows are
    // distinguishable from Storefront-sourced ones.
    upsertMock.mock.calls.forEach((c) => {
      expect(c[0]!.source).toBe("shopify_admin");
    });
  });

  it("propagates ShopifyAdminError (unauthorized etc.)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 401 }),
    );
    await expect(
      ingestShopifyCatalogViaAdmin("https://x.test", "x.myshopify.com", "bad", { fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("per-product upsert failure increments `errored` but does not abort", async () => {
    upsertMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("DB blip"))
      .mockResolvedValueOnce({});

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(adminBody({
      products: [
        adminProduct({ id: "gid://shopify/Product/1", handle: "a" }),
        adminProduct({ id: "gid://shopify/Product/2", handle: "b" }),
        adminProduct({ id: "gid://shopify/Product/3", handle: "c" }),
      ],
      hasNext: false,
    })));

    const result = await ingestShopifyCatalogViaAdmin(
      "https://x.test",
      "https://x.myshopify.com",
      "shpat_admin",
      { fetchImpl: fetchMock },
    );

    expect(result.ingested).toBe(2);
    expect(result.errored).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("uses the Admin endpoint + X-Shopify-Access-Token header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(adminBody({ products: [adminProduct()], hasNext: false })),
    );
    await ingestShopifyCatalogViaAdmin(
      "https://x.test",
      "https://example.myshopify.com",
      "shpat_admin",
      { fetchImpl: fetchMock },
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.myshopify.com/admin/api/2024-10/graphql.json");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Shopify-Access-Token"]).toBe("shpat_admin");
    // Crucial: must NOT use the Storefront header — that would silently
    // 401 against the Admin endpoint.
    expect(headers["X-Shopify-Storefront-Access-Token"]).toBeUndefined();
  });
});
