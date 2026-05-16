// ============================================================================
// WooCommerce webhook handlers — unit tests.
// Mirrors shopify-webhooks.test.ts pattern.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import type { Request as ExpressReq, Response as ExpressRes } from "express";

vi.mock("@ava/db", () => ({
  SiteCatalogRepo: {
    upsertProduct: vi.fn(),
    getProduct: vi.fn(),
  },
  SiteConfigRepo: {
    getSiteConfigByUrl: vi.fn(),
  },
}));

import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";
import {
  webhookProductsUpdate,
  webhookProductsDelete,
  toCatalogInput,
  verifyWooSignature,
} from "./woocommerce-webhooks.api.js";

const upsertMock = SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>;
const getProductMock = SiteCatalogRepo.getProduct as ReturnType<typeof vi.fn>;
const getSiteByUrlMock = SiteConfigRepo.getSiteConfigByUrl as ReturnType<typeof vi.fn>;

const SECRET = "test_woo_secret_shhh";

// ── Test doubles ────────────────────────────────────────────────────────────

interface MockResponse {
  status(n: number): MockResponse;
  send(body?: unknown): MockResponse;
  getStatus(): number;
  getBody(): unknown;
}
function mockRes(): MockResponse {
  let statusCode = 200;
  let body: unknown = undefined;
  const r: MockResponse = {
    status(n: number) { statusCode = n; return r; },
    send(b?: unknown) { body = b; return r; },
    getStatus() { return statusCode; },
    getBody() { return body; },
  };
  return r;
}
const asReq = (body: Buffer, headers: Record<string, string>): ExpressReq =>
  ({ body, headers } as unknown as ExpressReq);
const asRes = (m: MockResponse): ExpressRes => m as unknown as ExpressRes;

function signedHeaders(rawBody: Buffer, source: string, topic = "product.updated"): Record<string, string> {
  const sig = createHmac("sha256", SECRET).update(rawBody).digest("base64");
  return {
    "x-wc-webhook-signature": sig,
    "x-wc-webhook-source": source,
    "x-wc-webhook-topic": topic,
  };
}

type FixtureProduct = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  type: string;
  status: "publish" | "draft" | "private" | "pending";
  price: string;
  regular_price: string;
  images: Array<{ src: string }>;
  tags: Array<{ name: string }>;
  stock_status: "instock" | "outofstock" | "onbackorder";
  stock_quantity: number | null;
  variations: number[];
};

function productPayload(overrides: Partial<FixtureProduct> = {}): FixtureProduct {
  return {
    id: overrides.id ?? 777,
    name: overrides.name ?? "Raw Linen Tee",
    slug: overrides.slug ?? "raw-linen-tee",
    permalink: "https://shop.example/product/raw-linen-tee",
    description: "<p>Linen.</p>",
    type: "simple",
    status: overrides.status ?? "publish",
    price: overrides.price ?? "48.00",
    regular_price: "62.00",
    images: [{ src: "https://cdn.example/img.jpg" }],
    tags: [{ name: "summer" }],
    stock_status: overrides.stock_status ?? "instock",
    stock_quantity: overrides.stock_quantity ?? 5,
    variations: overrides.variations ?? [301, 302],
  };
}

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({});
  getProductMock.mockReset().mockResolvedValue(null);
  getSiteByUrlMock.mockReset();
  getSiteByUrlMock.mockResolvedValue({
    id: "sc_woo_1",
    siteUrl: "https://shop.example",
    wooWebhookSecret: SECRET,
  });
});

// ── Transform ───────────────────────────────────────────────────────────────

describe("toCatalogInput — Woo REST → SiteCatalog", () => {
  it("maps fields and prefixes externalId with 'wc:' to avoid Shopify collision", () => {
    const input = toCatalogInput("https://shop.example", productPayload());
    expect(input).toMatchObject({
      siteUrl: "https://shop.example",
      externalId: "wc:777",
      handle: "raw-linen-tee",
      title: "Raw Linen Tee",
      productType: "simple",
      imageUrl: "https://cdn.example/img.jpg",
      url: "https://shop.example/product/raw-linen-tee",
      priceMin: 48,
      priceMax: 62,
      source: "woocommerce_webhook",
      availability: "in_stock",
    });
    expect(JSON.parse(input.tags ?? "[]")).toEqual(["summer"]);
  });

  it("status=draft forces out_of_stock even if stock is in", () => {
    const input = toCatalogInput("https://x", productPayload({ status: "draft" }));
    expect(input.availability).toBe("out_of_stock");
  });

  it("stock_status=outofstock → out_of_stock", () => {
    const input = toCatalogInput("https://x", productPayload({ stock_status: "outofstock" }));
    expect(input.availability).toBe("out_of_stock");
  });
});

// ── HMAC verification ───────────────────────────────────────────────────────

describe("verifyWooSignature", () => {
  it("returns true for a correct base64 HMAC-SHA256 of the raw body", () => {
    const body = Buffer.from('{"id":1}');
    const sig = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyWooSignature(body, sig, SECRET)).toBe(true);
  });

  it("returns false for a tampered body", () => {
    const body = Buffer.from('{"id":1}');
    const sig = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyWooSignature(Buffer.from('{"id":2}'), sig, SECRET)).toBe(false);
  });

  it("returns false when secret is empty", () => {
    expect(verifyWooSignature(Buffer.from("x"), "anything", "")).toBe(false);
  });

  it("returns false when signature header is empty", () => {
    expect(verifyWooSignature(Buffer.from("x"), "", SECRET)).toBe(false);
  });
});

// ── webhookProductsUpdate ──────────────────────────────────────────────────

describe("webhookProductsUpdate — HMAC + upsert", () => {
  it("upserts the product on a verified webhook", async () => {
    const body = Buffer.from(JSON.stringify(productPayload()));
    const req = asReq(body, signedHeaders(body, "https://shop.example"));
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));

    expect(res.getStatus()).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "wc:777",
      source: "woocommerce_webhook",
    });
  });

  it("normalizes the source URL — path is stripped before SiteConfig lookup", async () => {
    const body = Buffer.from(JSON.stringify(productPayload()));
    const req = asReq(
      body,
      signedHeaders(body, "https://shop.example/some/path/?with=qs"),
    );
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));
    expect(getSiteByUrlMock).toHaveBeenCalledWith("https://shop.example");
    expect(res.getStatus()).toBe(200);
  });

  it("401s on tampered body (HMAC fails)", async () => {
    const body = Buffer.from(JSON.stringify(productPayload()));
    const headers = signedHeaders(body, "https://shop.example");
    const tampered = Buffer.from(JSON.stringify({ ...productPayload(), name: "TAMPERED" }));
    const req = asReq(tampered, headers);
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("401s when the source is unknown (must NOT 200 — alerts Woo)", async () => {
    getSiteByUrlMock.mockResolvedValueOnce(null);
    const body = Buffer.from(JSON.stringify(productPayload()));
    const req = asReq(body, signedHeaders(body, "https://unknown.example"));
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("401s when the site has no wooWebhookSecret configured", async () => {
    getSiteByUrlMock.mockResolvedValueOnce({
      id: "sc_woo_1",
      siteUrl: "https://shop.example",
      wooWebhookSecret: null,
    });
    const body = Buffer.from(JSON.stringify(productPayload()));
    const req = asReq(body, signedHeaders(body, "https://shop.example"));
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(401);
  });

  it("returns 200 even when upsert throws — Woo must not retry on internal errors", async () => {
    upsertMock.mockReset().mockRejectedValueOnce(new Error("DB down"));
    const body = Buffer.from(JSON.stringify(productPayload()));
    const req = asReq(body, signedHeaders(body, "https://shop.example"));
    const res = mockRes();

    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(200);
  });

  it("tolerates malformed JSON (still acks)", async () => {
    const body = Buffer.from("not valid json");
    const req = asReq(body, signedHeaders(body, "https://shop.example"));
    const res = mockRes();
    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("acks Woo 'ping' payloads ({ webhook_id }) without upserting", async () => {
    const body = Buffer.from(JSON.stringify({ webhook_id: 42 }));
    const req = asReq(body, signedHeaders(body, "https://shop.example"));
    const res = mockRes();
    await webhookProductsUpdate(req, asRes(res));
    expect(res.getStatus()).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// ── webhookProductsDelete ──────────────────────────────────────────────────

describe("webhookProductsDelete", () => {
  it("marks the existing row out_of_stock (preserves history)", async () => {
    getProductMock.mockResolvedValueOnce({
      handle: "raw-linen-tee",
      title: "Raw Linen Tee",
      variants: "[]",
    });
    const body = Buffer.from(JSON.stringify({ id: 777 }));
    const req = asReq(body, signedHeaders(body, "https://shop.example", "product.deleted"));
    const res = mockRes();

    await webhookProductsDelete(req, asRes(res));
    expect(res.getStatus()).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "wc:777",
      availability: "out_of_stock",
    });
  });

  it("acks gracefully when the row doesn't exist", async () => {
    getProductMock.mockResolvedValueOnce(null);
    const body = Buffer.from(JSON.stringify({ id: 99 }));
    const req = asReq(body, signedHeaders(body, "https://shop.example", "product.deleted"));
    const res = mockRes();

    await webhookProductsDelete(req, asRes(res));
    expect(res.getStatus()).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("401s on invalid HMAC", async () => {
    const body = Buffer.from(JSON.stringify({ id: 1 }));
    const req = asReq(body, {
      "x-wc-webhook-signature": "wrong",
      "x-wc-webhook-source": "https://shop.example",
      "x-wc-webhook-topic": "product.deleted",
    });
    const res = mockRes();
    await webhookProductsDelete(req, asRes(res));
    expect(res.getStatus()).toBe(401);
  });
});
