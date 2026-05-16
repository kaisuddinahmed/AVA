// ============================================================================
// WooCommerce client — unit tests with mocked fetch.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  listProducts,
  listAllProducts,
  WooCommerceError,
  type WooCredentials,
} from "./woocommerce.client.js";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// ── Fixture builders ────────────────────────────────────────────────────────

function storeApiProduct(overrides: Partial<{ id: number; slug: string; name: string; minAmount: string; maxAmount: string; minorUnit: number; inStock: boolean }> = {}) {
  return {
    id: overrides.id ?? 101,
    name: overrides.name ?? "Raw Linen Tee",
    slug: overrides.slug ?? "raw-linen-tee",
    permalink: "https://shop.example/product/raw-linen-tee",
    description: "<p>Linen.</p>",
    short_description: "",
    type: "simple",
    prices: {
      currency_code: "USD",
      price: overrides.minAmount ?? "4800",
      regular_price: overrides.maxAmount ?? "4800",
      sale_price: overrides.minAmount ?? "4800",
      price_range: {
        min_amount: overrides.minAmount ?? "4800",
        max_amount: overrides.maxAmount ?? "4800",
      },
      currency_minor_unit: overrides.minorUnit ?? 2,
    },
    images: [{ src: "https://cdn.example/img.jpg" }],
    tags: [{ name: "summer" }, { name: "linen" }],
    is_in_stock: overrides.inStock ?? true,
    is_purchasable: true,
    variations: [
      { id: 201, attributes: [{ name: "Size", option: "M" }] },
      { id: 202, attributes: [{ name: "Size", option: "L" }] },
    ],
  };
}

function restV3Product(overrides: Partial<{ id: number; slug: string; price: string; status: string; stock_status: string; stock_quantity: number | null }> = {}) {
  return {
    id: overrides.id ?? 501,
    name: "Raw Linen Tee",
    slug: overrides.slug ?? "raw-linen-tee",
    permalink: "https://shop.example/product/raw-linen-tee",
    description: "<p>Linen.</p>",
    short_description: "",
    type: "simple",
    status: overrides.status ?? "publish",
    price: overrides.price ?? "48.00",
    regular_price: "62.00",
    sale_price: overrides.price ?? "48.00",
    images: [{ src: "https://cdn.example/img.jpg" }],
    tags: [{ name: "summer" }],
    stock_quantity: overrides.stock_quantity ?? 12,
    stock_status: overrides.stock_status ?? "instock",
    manage_stock: true,
    sku: "RLT-X",
    variations: [301, 302],
  };
}

const STORE_CREDS: WooCredentials = { kind: "store_api" };
const REST_CREDS: WooCredentials = { kind: "rest_v3", consumerKey: "ck_x", consumerSecret: "cs_x" };

// ── Store API path ──────────────────────────────────────────────────────────

describe("WooCommerce.listProducts — Store API (public)", () => {
  it("requests /wp-json/wc/store/v1/products with no auth header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([storeApiProduct()]));
    await listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/shop\.example\/wp-json\/wc\/store\/v1\/products\?page=1&per_page=50$/);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("normalizes Store API minor-unit prices into major-unit decimals", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      storeApiProduct({ minAmount: "4800", maxAmount: "6200" }),
    ]));
    const { products } = await listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0]).toMatchObject({
      id: "101",
      handle: "raw-linen-tee",
      title: "Raw Linen Tee",
      priceMin: 48,
      priceMax: 62,
      currency: "USD",
      availableForSale: true,
    });
    expect(products[0].tags).toEqual(["summer", "linen"]);
    expect(products[0].imageUrl).toBe("https://cdn.example/img.jpg");
  });

  it("expands Store API variation attributes into option arrays", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([storeApiProduct()]));
    const { products } = await listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0].variants).toHaveLength(2);
    expect(products[0].variants[0]).toMatchObject({
      id: "201",
      title: "M",
      options: [{ name: "Size", value: "M" }],
    });
  });

  it("flags out-of-stock products with availableForSale=false", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      storeApiProduct({ inStock: false }),
    ]));
    const { products } = await listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0].availableForSale).toBe(false);
  });
});

// ── REST v3 path ────────────────────────────────────────────────────────────

describe("WooCommerce.listProducts — REST v3 (authenticated)", () => {
  it("sends Basic auth derived from consumer key/secret", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([restV3Product()]));
    await listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock });

    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const expectedToken = Buffer.from("ck_x:cs_x").toString("base64");
    expect(headers.Authorization).toBe(`Basic ${expectedToken}`);
  });

  it("hits /wp-json/wc/v3/products (NOT the Store API path)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([restV3Product()]));
    await listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toMatch(/\/wp-json\/wc\/v3\/products\?/);
    expect(url).not.toMatch(/wc\/store\/v1/);
  });

  it("parses REST v3 prices as major-unit decimals (no /100 normalization)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      restV3Product({ price: "48.00" }),
    ]));
    const { products } = await listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0].priceMin).toBe(48);
    expect(products[0].priceMax).toBe(62);
  });

  it("stock_status=outofstock → availableForSale=false", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      restV3Product({ stock_status: "outofstock" }),
    ]));
    const { products } = await listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0].availableForSale).toBe(false);
  });

  it("status=draft → availableForSale=false even if stock is in", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      restV3Product({ status: "draft", stock_status: "instock" }),
    ]));
    const { products } = await listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock });
    expect(products[0].availableForSale).toBe(false);
  });
});

// ── Pagination ──────────────────────────────────────────────────────────────

describe("WooCommerce.listAllProducts — pagination drain", () => {
  it("uses X-WP-TotalPages header to drive nextPage cursor", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(
        [storeApiProduct({ id: 1 }), storeApiProduct({ id: 2 })],
        200,
        { "x-wp-totalpages": "2", "x-wp-total": "3" },
      ))
      .mockResolvedValueOnce(jsonResponse(
        [storeApiProduct({ id: 3 })],
        200,
        { "x-wp-totalpages": "2", "x-wp-total": "3" },
      ));

    const all = await listAllProducts("https://shop.example", STORE_CREDS, { fetchImpl: fetchMock });
    expect(all).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Page query param advanced from 1 → 2
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toMatch(/page=1/);
    expect(urls[1]).toMatch(/page=2/);
  });

  it("respects maxProducts cap", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
      [storeApiProduct({ id: 1 }), storeApiProduct({ id: 2 }), storeApiProduct({ id: 3 })],
      200,
      { "x-wp-totalpages": "10" },
    ));
    const all = await listAllProducts("https://shop.example", STORE_CREDS, {
      fetchImpl: fetchMock,
      maxProducts: 2,
    });
    expect(all).toHaveLength(2);
  });

  it("falls back to page-fullness heuristic when X-WP headers are absent", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(
        Array.from({ length: 50 }, (_, i) => storeApiProduct({ id: i + 1 })),
      ))
      // Second page returns fewer than pageSize → stop.
      .mockResolvedValueOnce(jsonResponse([storeApiProduct({ id: 51 })]));

    const all = await listAllProducts("https://shop.example", STORE_CREDS, { fetchImpl: fetchMock });
    expect(all).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── Error taxonomy ──────────────────────────────────────────────────────────

describe("WooCommerce — error taxonomy", () => {
  it("401 → unauthorized", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }));
    await expect(listProducts("https://shop.example", REST_CREDS, 1, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "unauthorized", status: 401 });
  });

  it("404 → not_found (Woo not installed)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Not Found", { status: 404 }));
    await expect(listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "not_found" });
  });

  it("429 → rate_limited with retryAfterSec", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "7" } }),
    );
    try {
      await listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as WooCommerceError).kind).toBe("rate_limited");
      expect((e as WooCommerceError).retryAfterSec).toBe(7);
    }
  });

  it("fetch throw → network kind", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("DNS failure"));
    await expect(listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "network" });
  });

  it("non-array body → malformed_response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "nope" }));
    await expect(listProducts("https://shop.example", STORE_CREDS, 1, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "malformed_response" });
  });

  it("invalid site URL → not_found", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(listProducts("not a url", STORE_CREDS, 1, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
