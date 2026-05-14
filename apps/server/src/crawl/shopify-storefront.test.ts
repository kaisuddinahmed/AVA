// ============================================================================
// Shopify Storefront API client — unit tests with mocked fetch.
// Tests verify request shape, response transform, pagination, and the full
// error taxonomy (401/403/404/429/graphql/network/malformed).
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  listProducts,
  listAllProducts,
  ShopifyStorefrontError,
  type StorefrontProduct,
} from "./shopify-storefront.client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

interface RawProductNode {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  availableForSale: boolean;
  onlineStoreUrl: string | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  featuredImage: { url: string; altText: string | null } | null;
  variants: { edges: Array<{ node: Record<string, unknown> }> };
}

function nodeProduct(overrides: Partial<{ id: string; handle: string; title: string; price: string }> = {}): RawProductNode {
  return {
    id: overrides.id ?? "gid://shopify/Product/1",
    handle: overrides.handle ?? "raw-linen-tee",
    title: overrides.title ?? "Raw Linen Tee",
    description: "Lightweight raw linen.",
    productType: "Top",
    vendor: "Example Brand",
    tags: ["new", "linen"],
    availableForSale: true,
    onlineStoreUrl: "https://example.myshopify.com/products/raw-linen-tee",
    priceRange: {
      minVariantPrice: { amount: overrides.price ?? "48.00", currencyCode: "USD" },
      maxVariantPrice: { amount: overrides.price ?? "48.00", currencyCode: "USD" },
    },
    featuredImage: { url: "https://cdn.shopify.com/img.jpg", altText: null },
    variants: {
      edges: [{
        node: {
          id: "gid://shopify/ProductVariant/11",
          title: "M",
          sku: "RLT-M",
          price: { amount: overrides.price ?? "48.00", currencyCode: "USD" },
          availableForSale: true,
          quantityAvailable: 12,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      }],
    },
  };
}

function listProductsBody(opts: { products: RawProductNode[]; hasNext?: boolean; endCursor?: string | null }) {
  return {
    data: {
      products: {
        pageInfo: { hasNextPage: opts.hasNext ?? false, endCursor: opts.endCursor ?? null },
        edges: opts.products.map((node) => ({ node })),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("listProducts — request shape", () => {
  it("posts a GraphQL query to the versioned Storefront endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(listProductsBody({ products: [nodeProduct()] })),
    );

    await listProducts("https://example.myshopify.com", "tok_abc", null, { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.myshopify.com/api/2024-10/graphql.json");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Shopify-Storefront-Access-Token"]).toBe("tok_abc");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body.query).toContain("query ListProducts");
    expect(body.variables).toEqual({ first: 50, after: null });
  });

  it("accepts a bare hostname (no protocol) and builds the right URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(listProductsBody({ products: [] })),
    );
    await listProducts("example.myshopify.com", "tok", null, { fetchImpl: fetchMock });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.myshopify.com/api/2024-10/graphql.json");
  });

  it("clamps page size to [1, 250]", async () => {
    // Each fetch call needs a fresh Response (body is single-use).
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse(listProductsBody({ products: [] })),
    );
    await listProducts("example.myshopify.com", "tok", null, { fetchImpl: fetchMock, pageSize: 9999 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).variables.first).toBe(250);

    fetchMock.mockClear();
    await listProducts("example.myshopify.com", "tok", null, { fetchImpl: fetchMock, pageSize: 0 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).variables.first).toBe(1);
  });
});

describe("listProducts — response transform", () => {
  it("flattens edges → products and parses prices to numbers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(listProductsBody({
        products: [nodeProduct({ price: "48.00" }), nodeProduct({ id: "gid://shopify/Product/2", handle: "tee-2", price: "12.50" })],
        hasNext: true,
        endCursor: "cursor-A",
      })),
    );

    const result = await listProducts("example.myshopify.com", "tok", null, { fetchImpl: fetchMock });
    expect(result.products.length).toBe(2);
    expect(result.products[0]).toMatchObject<Partial<StorefrontProduct>>({
      id: "gid://shopify/Product/1",
      handle: "raw-linen-tee",
      title: "Raw Linen Tee",
      priceMin: 48,
      priceMax: 48,
      currency: "USD",
    });
    expect(result.products[0].variants.length).toBe(1);
    expect(result.products[0].variants[0].price).toBe(48);
    expect(result.pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-A" });
  });

  it("tolerates missing featuredImage and unparseable amounts", async () => {
    const p = nodeProduct();
    p.featuredImage = null;
    p.priceRange.minVariantPrice.amount = "garbage";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(listProductsBody({ products: [p] })),
    );
    const result = await listProducts("example.myshopify.com", "tok", null, { fetchImpl: fetchMock });
    expect(result.products[0].imageUrl).toBeNull();
    expect(result.products[0].priceMin).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("listProducts — pagination cursor", () => {
  it("passes the cursor in subsequent calls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(listProductsBody({ products: [] })),
    );
    await listProducts("example.myshopify.com", "tok", "cursor-X", { fetchImpl: fetchMock });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.variables.after).toBe("cursor-X");
  });
});

describe("listAllProducts — drains pagination", () => {
  it("walks every page until hasNextPage=false", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listProductsBody({ products: [nodeProduct({ id: "p1" })], hasNext: true, endCursor: "c1" })))
      .mockResolvedValueOnce(jsonResponse(listProductsBody({ products: [nodeProduct({ id: "p2" })], hasNext: true, endCursor: "c2" })))
      .mockResolvedValueOnce(jsonResponse(listProductsBody({ products: [nodeProduct({ id: "p3" })], hasNext: false, endCursor: null })));

    const all = await listAllProducts("example.myshopify.com", "tok", { fetchImpl: fetchMock });
    expect(all.length).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).variables.after).toBe("c1");
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).variables.after).toBe("c2");
  });

  it("honors maxProducts safety cap", async () => {
    // Response bodies are single-use — generate a fresh Response per call.
    const body = () => listProductsBody({
      products: Array.from({ length: 10 }, (_, i) => nodeProduct({ id: `p${i}` })),
      hasNext: true,
      endCursor: "c",
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(body()));
    const all = await listAllProducts("example.myshopify.com", "tok", {
      fetchImpl: fetchMock, pageSize: 10, maxProducts: 25,
    });
    expect(all.length).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

describe("ShopifyStorefrontError — kinds", () => {
  it("maps 401 → unauthorized (the wizard re-prompts for the token)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }));
    await expect(listProducts("x.myshopify.com", "bad", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "unauthorized", status: 401 });
  });

  it("maps 403 → forbidden", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 403 }));
    await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "forbidden" });
  });

  it("maps 404 → not_found", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
    await expect(listProducts("nope.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "not_found" });
  });

  it("maps 429 → rate_limited and exposes retry-after", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "5" } }),
    );
    try {
      await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ShopifyStorefrontError);
      expect((e as ShopifyStorefrontError).kind).toBe("rate_limited");
      expect((e as ShopifyStorefrontError).retryAfterSec).toBe(5);
    }
  });

  it("maps GraphQL errors[] → graphql kind", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ errors: [{ message: "Field 'foo' doesn't exist" }] }),
    );
    await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "graphql" });
  });

  it("maps thrown fetch errors → network kind", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("DNS failure"));
    await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "network" });
  });

  it("maps malformed JSON body → malformed_response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not json", { status: 200, headers: { "content-type": "text/html" } }),
    );
    await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "malformed_response" });
  });
});
