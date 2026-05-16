// ============================================================================
// Shopify webhook integration tests — supertest against the real Express app.
//
// Regression coverage for the middleware-ordering bug Codex caught in Phase
// 1.3 review: when express.json() ran before the webhook router, req.body
// arrived as a parsed object instead of Buffer, so HMAC verification failed
// in production while unit tests (which called handlers directly) were green.
//
// These tests post REAL JSON with a REAL Content-Type: application/json
// header through the entire middleware stack, exercising the path that broke.
// ============================================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createHmac } from "crypto";
import request from "supertest";
import type { Express } from "express";

// Stub upstream env vars BEFORE any module evaluates them. Importing
// `../app.js` transitively constructs a Groq client at module load and will
// throw without GROQ_API_KEY. Same for SHOPIFY_API_SECRET, which the webhook
// HMAC verifier reads.
const API_SECRET = "test_secret_integration";
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? "test-stub";
process.env.SHOPIFY_API_SECRET = API_SECRET;

vi.mock("@ava/db", () => ({
  SiteCatalogRepo: {
    upsertProduct: vi.fn(),
    getProduct: vi.fn(),
  },
  SiteConfigRepo: {
    getSiteConfigByUrl: vi.fn(),
    getSiteConfigBySiteKey: vi.fn(),
    setIntegrationStatus: vi.fn(),
    installShopify: vi.fn(),
    setShopifyScriptTagId: vi.fn(),
    setShopifyWebhookIds: vi.fn(),
    clearShopifyCredentials: vi.fn(),
    markSiteDeleted: vi.fn(),
  },
  SessionRepo: { listSessions: vi.fn(), getSession: vi.fn() },
}));

import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";

let createApp: () => Express;
beforeAll(async () => {
  ({ createApp } = await import("../app.js"));
});

function sign(rawBody: string): string {
  return createHmac("sha256", API_SECRET).update(rawBody).digest("base64");
}

const upsertMock = SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>;
const getProductMock = SiteCatalogRepo.getProduct as ReturnType<typeof vi.fn>;
const getSiteByUrlMock = SiteConfigRepo.getSiteConfigByUrl as ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = API_SECRET;
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
  getProductMock.mockReset();
  getProductMock.mockResolvedValue(null);
  getSiteByUrlMock.mockReset();
  getSiteByUrlMock.mockResolvedValue({ id: "sc_1", siteUrl: "https://integration.myshopify.com" });
});

const PRODUCT_PAYLOAD = {
  id: 555000111,
  title: "Integration Tee",
  handle: "integration-tee",
  vendor: "Test Co",
  product_type: "Top",
  body_html: "<p>via supertest</p>",
  tags: "integration",
  status: "active",
  image: { src: "https://cdn.shopify.com/i.jpg" },
  variants: [
    {
      id: 1,
      title: "OS",
      sku: "INT-OS",
      price: "20.00",
      inventory_quantity: 1,
      inventory_policy: "deny",
      option1: "OS",
      option2: null,
      option3: null,
    },
  ],
};

describe("Shopify webhooks — Express integration (real middleware stack)", () => {
  it("products/update: signed application/json POST verifies HMAC and upserts", async () => {
    const app = createApp();
    // serialize EXACTLY what we sign — any whitespace difference would
    // tamper the body relative to the HMAC.
    const raw = JSON.stringify(PRODUCT_PAYLOAD);

    const res = await request(app)
      .post("/api/shopify/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-shopify-hmac-sha256", sign(raw))
      .set("x-shopify-shop-domain", "integration.myshopify.com")
      .send(raw);

    expect(res.status).toBe(200);
    // Allow the async post-ack work to settle (handler ack-then-process pattern).
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "gid://shopify/Product/555000111",
      source: "shopify_webhook",
    });
  });

  it("products/update: tampered body is rejected with 401", async () => {
    const app = createApp();
    const raw = JSON.stringify(PRODUCT_PAYLOAD);
    const sig = sign(raw); // signed BEFORE tamper

    const tampered = JSON.stringify({ ...PRODUCT_PAYLOAD, title: "TAMPERED" });

    const res = await request(app)
      .post("/api/shopify/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-shopify-hmac-sha256", sig)
      .set("x-shopify-shop-domain", "integration.myshopify.com")
      .send(tampered);

    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("products/delete: marks out_of_stock when row exists", async () => {
    getProductMock.mockResolvedValueOnce({
      handle: "integration-tee",
      title: "Integration Tee",
      variants: "[]",
    });
    const app = createApp();
    const raw = JSON.stringify({ id: 555000111 });

    const res = await request(app)
      .post("/api/shopify/webhooks/products/delete")
      .set("Content-Type", "application/json")
      .set("x-shopify-hmac-sha256", sign(raw))
      .set("x-shopify-shop-domain", "integration.myshopify.com")
      .send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "gid://shopify/Product/555000111",
      availability: "out_of_stock",
    });
  });

  it("products/create: routes to the update handler (same Shopify payload)", async () => {
    const app = createApp();
    const raw = JSON.stringify(PRODUCT_PAYLOAD);

    const res = await request(app)
      .post("/api/shopify/webhooks/products/create")
      .set("Content-Type", "application/json")
      .set("x-shopify-hmac-sha256", sign(raw))
      .set("x-shopify-shop-domain", "integration.myshopify.com")
      .send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("missing HMAC header is rejected with 401", async () => {
    const app = createApp();
    const raw = JSON.stringify(PRODUCT_PAYLOAD);

    const res = await request(app)
      .post("/api/shopify/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-shopify-shop-domain", "integration.myshopify.com")
      .send(raw);

    expect(res.status).toBe(401);
  });
});

// ── WooCommerce — Phase 1.4.5 ───────────────────────────────────────────────

const WOO_SECRET = "wc_test_secret";

function signWoo(raw: string): string {
  return createHmac("sha256", WOO_SECRET).update(raw).digest("base64");
}

const WOO_PAYLOAD = {
  id: 7777,
  name: "Linen Tee",
  slug: "linen-tee",
  permalink: "https://shop.example/product/linen-tee",
  description: "<p>x</p>",
  type: "simple",
  status: "publish",
  price: "48.00",
  regular_price: "48.00",
  images: [{ src: "https://cdn.example/i.jpg" }],
  tags: [],
  stock_status: "instock",
  stock_quantity: 1,
  variations: [],
};

describe("WooCommerce webhooks — Express integration (real middleware stack)", () => {
  beforeEach(() => {
    upsertMock.mockReset().mockResolvedValue({});
    getProductMock.mockReset().mockResolvedValue(null);
    getSiteByUrlMock.mockReset().mockResolvedValue({
      id: "sc_woo_1",
      siteUrl: "https://shop.example",
      wooWebhookSecret: WOO_SECRET,
    });
  });

  it("products/update: signed JSON POST is verified and upserts", async () => {
    const app = createApp();
    const raw = JSON.stringify(WOO_PAYLOAD);

    const res = await request(app)
      .post("/api/woocommerce/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signWoo(raw))
      .set("x-wc-webhook-source", "https://shop.example")
      .set("x-wc-webhook-topic", "product.updated")
      .send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "wc:7777",
      source: "woocommerce_webhook",
    });
  });

  it("products/update: tampered body returns 401", async () => {
    const app = createApp();
    const raw = JSON.stringify(WOO_PAYLOAD);
    const sig = signWoo(raw);
    const tampered = JSON.stringify({ ...WOO_PAYLOAD, name: "TAMPERED" });

    const res = await request(app)
      .post("/api/woocommerce/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", sig)
      .set("x-wc-webhook-source", "https://shop.example")
      .send(tampered);

    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("products/update: unknown source returns 401 (NOT 200)", async () => {
    getSiteByUrlMock.mockResolvedValueOnce(null);
    const app = createApp();
    const raw = JSON.stringify(WOO_PAYLOAD);

    const res = await request(app)
      .post("/api/woocommerce/webhooks/products/update")
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signWoo(raw))
      .set("x-wc-webhook-source", "https://unknown.example")
      .send(raw);

    expect(res.status).toBe(401);
  });

  it("products/delete: marks out_of_stock when row exists", async () => {
    getProductMock.mockResolvedValueOnce({
      handle: "linen-tee",
      title: "Linen Tee",
      variants: "[]",
    });
    const app = createApp();
    const raw = JSON.stringify({ id: 7777 });

    const res = await request(app)
      .post("/api/woocommerce/webhooks/products/delete")
      .set("Content-Type", "application/json")
      .set("x-wc-webhook-signature", signWoo(raw))
      .set("x-wc-webhook-source", "https://shop.example")
      .set("x-wc-webhook-topic", "product.deleted")
      .send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({
      externalId: "wc:7777",
      availability: "out_of_stock",
    });
  });
});
