// ============================================================================
// billing.api — Phase 4.5 Codex P2 integration tests.
//
// Covers the Express route layer with supertest. Existing tests cover the
// service + client + plan registry; these tests fill the gap Codex flagged
// (no coverage at the route boundary, where Zod validation + status codes
// matter).
//
// Asserts:
//   - GET /api/billing/plans returns the registry
//   - POST /api/billing/start validates body with Zod (400 on bad input)
//   - POST /api/billing/start free path returns { confirmationUrl: null }
//   - POST /api/billing/start paid path returns { confirmationUrl }
//   - POST /api/billing/start surfaces service errors as 400
//   - GET /api/billing/callback re-syncs status
//   - GET /api/billing/status 404 when site unknown
//   - GET /api/billing/status returns the persisted plan + status
// ============================================================================

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? "test-stub";
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? "test_secret_billing";

// ── Service mocks ──────────────────────────────────────────────────────────

const startSubscription = vi.fn();
const syncSubscriptionStatus = vi.fn();

vi.mock("../billing/billing.service.js", () => ({
  startSubscription: (...args: unknown[]) => startSubscription(...args),
  syncSubscriptionStatus: (...args: unknown[]) => syncSubscriptionStatus(...args),
}));

// ── Repo mocks (status endpoint reads SiteConfig directly) ─────────────────

const getSiteConfigByShopifyShop = vi.fn();

vi.mock("@ava/db", () => ({
  SiteCatalogRepo: { upsertProduct: vi.fn(), getProduct: vi.fn() },
  SiteConfigRepo: {
    getSiteConfigByUrl: vi.fn(),
    getSiteConfigBySiteKey: vi.fn(),
    getSiteConfigByShopifyShop: (...args: unknown[]) => getSiteConfigByShopifyShop(...args),
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

let createApp: () => Express;
beforeAll(async () => {
  ({ createApp } = await import("../app.js"));
});

beforeEach(() => {
  startSubscription.mockReset();
  syncSubscriptionStatus.mockReset();
  getSiteConfigByShopifyShop.mockReset();
});

// ── GET /api/billing/plans ────────────────────────────────────────────────

describe("GET /api/billing/plans", () => {
  it("returns the three-tier registry from billing-plans.ts", async () => {
    const app = createApp();
    const res = await request(app).get("/api/billing/plans");
    expect(res.status).toBe(200);
    expect(res.body.plans.map((p: { id: string }) => p.id)).toEqual(["free", "starter", "pro"]);
  });
});

// ── POST /api/billing/start ───────────────────────────────────────────────

describe("POST /api/billing/start", () => {
  it("returns 400 with Zod error details on missing fields", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "shop.myshopify.com" }); // missing planId
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 on unknown planId (Zod enum rejects)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "shop.myshopify.com", planId: "enterprise" });
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-URL returnUrl override", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "shop.myshopify.com", planId: "starter", returnUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("free plan path returns { confirmationUrl: null } and does not require returnUrl", async () => {
    startSubscription.mockResolvedValue({
      plan: "free", confirmationUrl: null, appSubscriptionId: null,
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "shop.myshopify.com", planId: "free" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plan: "free", confirmationUrl: null, appSubscriptionId: null });
  });

  it("server builds returnUrl from APP_URL env (Codex P1 4.5.1)", async () => {
    process.env.APP_URL = "https://api.ava.example";
    try {
      startSubscription.mockResolvedValue({
        plan: "starter", confirmationUrl: "https://x.shopify.com/charge", appSubscriptionId: "gid://sub/1",
      });
      const app = createApp();
      const res = await request(app)
        .post("/api/billing/start")
        .set("Content-Type", "application/json")
        .send({ shopDomain: "shop.myshopify.com", planId: "starter" }); // no returnUrl
      expect(res.status).toBe(200);
      // Third arg to startSubscription is the server-built returnUrl.
      const [, , returnUrl] = startSubscription.mock.calls[0] as [string, string, string];
      expect(returnUrl).toBe("https://api.ava.example/api/billing/callback?shop=shop.myshopify.com");
    } finally {
      delete process.env.APP_URL;
    }
  });

  it("accepts explicit returnUrl override when caller wants to bypass APP_URL", async () => {
    startSubscription.mockResolvedValue({
      plan: "starter", confirmationUrl: "https://x.shopify.com/charge", appSubscriptionId: "gid://sub/1",
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({
        shopDomain: "shop.myshopify.com",
        planId: "starter",
        returnUrl: "https://custom.example/cb",
      });
    expect(res.status).toBe(200);
    const [, , returnUrl] = startSubscription.mock.calls[0] as [string, string, string];
    expect(returnUrl).toBe("https://custom.example/cb");
  });

  it("paid plan path returns confirmationUrl + subscriptionId", async () => {
    startSubscription.mockResolvedValue({
      plan: "starter",
      confirmationUrl: "https://x.shopify.com/charge/123",
      appSubscriptionId: "gid://sub/1",
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "shop.myshopify.com", planId: "starter" });
    expect(res.status).toBe(200);
    expect(res.body.confirmationUrl).toBe("https://x.shopify.com/charge/123");
    expect(res.body.appSubscriptionId).toBe("gid://sub/1");
  });

  it("surfaces service errors as 400 with the error message", async () => {
    startSubscription.mockRejectedValue(new Error("Shopify not installed for shop=missing"));
    const app = createApp();
    const res = await request(app)
      .post("/api/billing/start")
      .set("Content-Type", "application/json")
      .send({ shopDomain: "missing.myshopify.com", planId: "starter" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Shopify not installed");
  });
});

// ── GET /api/billing/callback ─────────────────────────────────────────────

describe("GET /api/billing/callback", () => {
  it("returns 400 when shop param missing", async () => {
    const app = createApp();
    const res = await request(app).get("/api/billing/callback");
    expect(res.status).toBe(400);
  });

  it("calls syncSubscriptionStatus and returns the result", async () => {
    syncSubscriptionStatus.mockResolvedValue({
      status: "ACTIVE", subscriptionId: "gid://sub/1", usageLineItemId: "gid://li/u",
    });
    const app = createApp();
    const res = await request(app).get("/api/billing/callback?shop=shop.myshopify.com");
    expect(res.status).toBe(200);
    expect(syncSubscriptionStatus).toHaveBeenCalledWith("shop.myshopify.com");
    expect(res.body.shop).toBe("shop.myshopify.com");
    expect(res.body.synced.status).toBe("ACTIVE");
  });

  it("returns 500 on service failure", async () => {
    syncSubscriptionStatus.mockRejectedValue(new Error("no token"));
    const app = createApp();
    const res = await request(app).get("/api/billing/callback?shop=shop.myshopify.com");
    expect(res.status).toBe(500);
  });
});

// ── GET /api/billing/status ───────────────────────────────────────────────

describe("GET /api/billing/status", () => {
  it("returns 400 when shopDomain missing", async () => {
    const app = createApp();
    const res = await request(app).get("/api/billing/status");
    expect(res.status).toBe(400);
  });

  it("returns 404 when SiteConfig not found", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app).get("/api/billing/status?shopDomain=unknown.myshopify.com");
    expect(res.status).toBe(404);
  });

  it("returns persisted plan + status", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue({
      siteUrl: "https://shop.myshopify.com",
      shopifyAppPlan: "starter",
      shopifyAppSubscriptionStatus: "ACTIVE",
      shopifyAppSubscriptionExpiresAt: new Date("2026-06-01T00:00:00Z"),
      shopifyAppSubscriptionTest: false,
    });
    const app = createApp();
    const res = await request(app).get("/api/billing/status?shopDomain=shop.myshopify.com");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      shopDomain: "shop.myshopify.com",
      siteUrl: "https://shop.myshopify.com",
      plan: "starter",
      status: "ACTIVE",
      test: false,
    });
  });
});
