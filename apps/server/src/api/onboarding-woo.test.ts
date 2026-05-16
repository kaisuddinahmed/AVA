// ============================================================================
// Onboarding (WooCommerce quick) — integration test for the full orchestrator.
//
// Exercises POST /api/onboarding/woocommerce-quick end-to-end with mocked
// fetch (homepage + Store API / REST v3 + sitemap) and mocked repositories.
// Mirrors onboarding-shopify.test.ts.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock repositories before importing the endpoint ─────────────────────────

vi.mock("@ava/db", () => ({
  SiteConfigRepo: {
    installWooCommerce: vi.fn().mockResolvedValue({ id: "sc_woo_1", siteKey: "avak_test_woo_0001" }),
  },
  SiteCatalogRepo: {
    upsertProduct: vi.fn().mockResolvedValue({}),
  },
  SiteMapRepo: {
    upsertSiteMap: vi.fn().mockResolvedValue({}),
  },
}));

import { SiteConfigRepo, SiteCatalogRepo, SiteMapRepo } from "@ava/db";
import { wooCommerceQuickOnboard } from "./onboarding-woo.api.js";

const installWooMock = SiteConfigRepo.installWooCommerce as ReturnType<typeof vi.fn>;
const upsertProductMock = SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>;
const upsertSiteMapMock = SiteMapRepo.upsertSiteMap as ReturnType<typeof vi.fn>;

import type { Request as ExpressReq, Response as ExpressRes } from "express";

interface MockResponse {
  status(n: number): MockResponse;
  json(b: unknown): MockResponse;
  getStatus(): number;
  getBody(): unknown;
}
function mockRes(): MockResponse {
  let statusCode = 200;
  let body: unknown = undefined;
  const r: MockResponse = {
    status(n: number) { statusCode = n; return r; },
    json(b: unknown) { body = b; return r; },
    getStatus() { return statusCode; },
    getBody() { return body; },
  };
  return r;
}
const asReq = (body: unknown): ExpressReq => ({ body } as unknown as ExpressReq);
const asRes = (m: MockResponse): ExpressRes => m as unknown as ExpressRes;

function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}
function htmlResponse(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html", ...headers } });
}
function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

const WOO_HOME_HTML = `
  <html><head>
    <meta name="generator" content="WooCommerce 8.5.0">
    <link rel="stylesheet" href="https://shop.example/wp-content/plugins/woocommerce/assets/css/woocommerce.css">
  </head><body class="home woocommerce-page"></body></html>
`;

const STORE_API_BODY = [
  {
    id: 101,
    name: "Raw Linen Tee",
    slug: "raw-linen-tee",
    permalink: "https://shop.example/product/raw-linen-tee",
    description: "<p>Linen.</p>",
    type: "simple",
    prices: {
      currency_code: "USD",
      price: "4800",
      regular_price: "4800",
      price_range: { min_amount: "4800", max_amount: "4800" },
      currency_minor_unit: 2,
    },
    images: [{ src: "https://cdn.example/img.jpg" }],
    tags: [{ name: "summer" }],
    is_in_stock: true,
    is_purchasable: true,
    variations: [],
  },
];

const REST_V3_BODY = [
  {
    id: 501,
    name: "Raw Linen Tee",
    slug: "raw-linen-tee",
    permalink: "https://shop.example/product/raw-linen-tee",
    description: "<p>Linen.</p>",
    type: "simple",
    status: "publish",
    price: "48.00",
    regular_price: "48.00",
    images: [{ src: "https://cdn.example/img.jpg" }],
    tags: [],
    stock_status: "instock",
    stock_quantity: 5,
    manage_stock: true,
    variations: [],
  },
];

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example/</loc></url>
  <url><loc>https://shop.example/product/raw-linen-tee</loc></url>
  <url><loc>https://shop.example/cart/</loc></url>
  <url><loc>https://shop.example/checkout/</loc></url>
</urlset>`;

function buildFetchRouter(opts: {
  homepageResponse?: () => Response;
  storeApiResponse?: () => Response;
  restV3Response?: () => Response;
  sitemapResponse?: () => Response;
} = {}): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
    if (url.includes("/wp-json/wc/store/v1/products")) {
      return (opts.storeApiResponse ?? (() => jsonResponse(STORE_API_BODY, { "x-wp-totalpages": "1", "x-wp-total": String(STORE_API_BODY.length) })))();
    }
    if (url.includes("/wp-json/wc/v3/products")) {
      return (opts.restV3Response ?? (() => jsonResponse(REST_V3_BODY, { "x-wp-totalpages": "1", "x-wp-total": String(REST_V3_BODY.length) })))();
    }
    if (url.includes("sitemap")) {
      return (opts.sitemapResponse ?? (() => xmlResponse(SITEMAP_XML)))();
    }
    if (url.includes("robots.txt")) {
      return new Response("Sitemap: https://shop.example/sitemap.xml", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return (opts.homepageResponse ?? (() => htmlResponse(WOO_HOME_HTML)))();
  });
}

beforeEach(() => {
  installWooMock.mockReset().mockResolvedValue({ id: "sc_woo_1", siteKey: "avak_test_woo_0001" });
  upsertProductMock.mockReset().mockResolvedValue({});
  upsertSiteMapMock.mockReset().mockResolvedValue({});
});
afterEach(() => { vi.unstubAllGlobals(); });

// ── Happy path — public Store API (no credentials) ──────────────────────────

describe("POST /api/onboarding/woocommerce-quick — Store API path", () => {
  it("orchestrates detect → catalog → page-map and returns a full preview", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const req = asReq({ shopUrl: "shop.example" });
    const res = mockRes();
    await wooCommerceQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as Record<string, unknown>;
    expect(body).toMatchObject({
      platform: "woocommerce",
      transport: "store_api",
      siteId: "sc_woo_1",
      siteUrl: "https://shop.example",
    });
    expect((body.products as Record<string, number>).ingested).toBe(1);
    expect(upsertProductMock).toHaveBeenCalledTimes(1);
    expect(upsertProductMock.mock.calls[0]![0]!.source).toBe("woocommerce_store");
  });

  it("persists integrationStatus='mapped' — never 'limited_active' during preview", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    await wooCommerceQuickOnboard(asReq({ shopUrl: "shop.example" }), asRes(mockRes()));
    expect(installWooMock).toHaveBeenCalledTimes(1);
    expect(installWooMock.mock.calls[0]![0]!.integrationStatus).toBe("mapped");
  });
});

// ── REST v3 path (creds supplied) ───────────────────────────────────────────

describe("POST /api/onboarding/woocommerce-quick — REST v3 path", () => {
  it("uses REST v3 transport and reports source='woocommerce_rest' when creds supplied", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const req = asReq({
      shopUrl: "shop.example",
      consumerKey: "ck_demo",
      consumerSecret: "cs_demo",
    });
    const res = mockRes();
    await wooCommerceQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as Record<string, unknown>;
    expect(body.transport).toBe("rest_v3");
    expect(upsertProductMock.mock.calls[0]![0]!.source).toBe("woocommerce_rest");
    expect(installWooMock.mock.calls[0]![0]).toMatchObject({
      siteUrl: "https://shop.example",
      consumerKey: "ck_demo",
      consumerSecret: "cs_demo",
      integrationStatus: "mapped",
    });
  });

  it("rejects with 400 if only one of consumerKey/consumerSecret is provided", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({ shopUrl: "shop.example", consumerKey: "ck_demo" }), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("propagates Woo 'unauthorized' as 401 so wizard can re-prompt for creds", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      restV3Response: () => new Response("", { status: 401 }),
    }));
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({
      shopUrl: "shop.example",
      consumerKey: "ck_bad",
      consumerSecret: "cs_bad",
    }), asRes(res));
    expect(res.getStatus()).toBe(401);
    expect((res.getBody() as Record<string, unknown>).kind).toBe("unauthorized");
  });
});

// ── Detection failures ──────────────────────────────────────────────────────

describe("POST /api/onboarding/woocommerce-quick — detection guards", () => {
  it("400s when the URL is not a WooCommerce store", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      homepageResponse: () => htmlResponse(`<html><head><meta name="generator" content="Shopify"></head><body></body></html>`),
    }));
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));
    expect(res.getStatus()).toBe(400);
    expect((res.getBody() as Record<string, unknown>).error).toMatch(/not appear to be a WooCommerce/);
    expect(installWooMock).not.toHaveBeenCalled();
  });

  it("502s when the homepage fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED")));
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));
    expect(res.getStatus()).toBe(502);
  });

  it("400s on schema validation failure", async () => {
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({ shopUrl: "" }), asRes(res));
    expect(res.getStatus()).toBe(400);
  });
});

// ── Sitemap walking — non-fatal ─────────────────────────────────────────────

describe("POST /api/onboarding/woocommerce-quick — sitemap is non-fatal", () => {
  it("returns 200 even if the sitemap fetch fails", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      sitemapResponse: () => new Response("", { status: 500 }),
    }));
    const res = mockRes();
    await wooCommerceQuickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));
    expect(res.getStatus()).toBe(200);
    // sitemap totals are 0 — but the response still goes out.
    expect((res.getBody() as Record<string, unknown>).sitemap).toBeDefined();
  });
});

// Vite/TS quirk: keep the SiteMapRepo import live so vi.mock is registered.
void upsertSiteMapMock;
