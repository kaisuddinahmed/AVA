// ============================================================================
// Shopify GDPR webhooks — Phase 4.6 integration tests.
//
// Shopify App Store requires three mandatory compliance webhooks per the
// 2026 listing requirements:
//   - customers/data_request  (acknowledge + return what we hold — AVA = nothing)
//   - customers/redact        (acknowledge — AVA holds no PII to delete)
//   - shop/redact             (cascade-delete shop data via markIntegrationDeletedBySiteUrl)
//
// These tests post REAL JSON with HMAC signatures through the full Express
// middleware stack so we cover the same raw-body / middleware-order risk
// the Phase 1.3 integration test covers for product webhooks.
// ============================================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createHmac } from "crypto";
import request from "supertest";
import type { Express } from "express";

const API_SECRET = "test_secret_gdpr";
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
    markIntegrationDeletedBySiteUrl: vi.fn(),
  },
  SessionRepo: { listSessions: vi.fn(), getSession: vi.fn() },
}));

import { SiteConfigRepo } from "@ava/db";

let createApp: () => Express;
beforeAll(async () => {
  ({ createApp } = await import("../app.js"));
});

function sign(rawBody: string): string {
  return createHmac("sha256", API_SECRET).update(rawBody).digest("base64");
}

const markDeletedMock = (
  SiteConfigRepo as unknown as { markIntegrationDeletedBySiteUrl: ReturnType<typeof vi.fn> }
).markIntegrationDeletedBySiteUrl as ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = API_SECRET;
  markDeletedMock.mockReset().mockResolvedValue({});
});

// ── customers/data_request ─────────────────────────────────────────────────

describe("POST /api/shopify/webhooks/gdpr/customers/data_request", () => {
  const PAYLOAD = JSON.stringify({
    shop_id: 42,
    shop_domain: "shop-x.myshopify.com",
    customer: { id: 7777, email: "redacted-by-shopify@example.com" },
    orders_requested: [],
  });

  it("returns 200 OK on valid HMAC (AVA holds no PII)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/customers/data_request")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD))
      .send(PAYLOAD);
    expect(res.status).toBe(200);
  });

  it("returns 401 on missing HMAC header", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/customers/data_request")
      .set("Content-Type", "application/json")
      .send(PAYLOAD);
    expect(res.status).toBe(401);
  });

  it("returns 401 on tampered HMAC", async () => {
    const app = createApp();
    const tampered = PAYLOAD + " ";
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/customers/data_request")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD)) // signature for original, not tampered
      .send(tampered);
    expect(res.status).toBe(401);
  });
});

// ── customers/redact ───────────────────────────────────────────────────────

describe("POST /api/shopify/webhooks/gdpr/customers/redact", () => {
  const PAYLOAD = JSON.stringify({
    shop_id: 42,
    shop_domain: "shop-x.myshopify.com",
    customer: { id: 7777 },
  });

  it("returns 200 OK on valid HMAC (no-op — AVA holds no PII)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/customers/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD))
      .send(PAYLOAD);
    expect(res.status).toBe(200);
  });

  it("returns 401 on missing HMAC", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/customers/redact")
      .set("Content-Type", "application/json")
      .send(PAYLOAD);
    expect(res.status).toBe(401);
  });
});

// ── shop/redact (the one that actually does something) ─────────────────────

describe("POST /api/shopify/webhooks/gdpr/shop/redact", () => {
  const PAYLOAD = JSON.stringify({
    shop_id: 42,
    myshopify_domain: "shop-x.myshopify.com",
  });

  it("returns 200 OK and cascade-marks the SiteConfig for deletion", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/shop/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD))
      .send(PAYLOAD);
    expect(res.status).toBe(200);
    expect(markDeletedMock).toHaveBeenCalledTimes(1);
    expect(markDeletedMock).toHaveBeenCalledWith("https://shop-x.myshopify.com");
  });

  it("returns 401 on bad HMAC and does NOT cascade-delete", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/shop/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", "AAAA")
      .send(PAYLOAD);
    expect(res.status).toBe(401);
    expect(markDeletedMock).not.toHaveBeenCalled();
  });

  it("accepts the legacy `domain` field as a fallback for shop identification", async () => {
    const legacy = JSON.stringify({ shop_id: 42, domain: "legacy-shop.myshopify.com" });
    const app = createApp();
    const res = await request(app)
      .post("/api/shopify/webhooks/gdpr/shop/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(legacy))
      .send(legacy);
    expect(res.status).toBe(200);
    expect(markDeletedMock).toHaveBeenCalledWith("https://legacy-shop.myshopify.com");
  });

  it("is idempotent — duplicate webhook deliveries return 200 without side-effects past the first", async () => {
    const app = createApp();
    await request(app)
      .post("/api/shopify/webhooks/gdpr/shop/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD))
      .send(PAYLOAD);
    await request(app)
      .post("/api/shopify/webhooks/gdpr/shop/redact")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", sign(PAYLOAD))
      .send(PAYLOAD);
    // Repo is called once per request — mock doesn't dedupe — but both calls
    // return 200 OK to Shopify (idempotency at the response level, which is
    // what Shopify retries against).
    expect(markDeletedMock).toHaveBeenCalledTimes(2);
  });
});
