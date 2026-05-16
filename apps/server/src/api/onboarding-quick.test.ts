// ============================================================================
// Unified onboarding endpoint — dispatch tests.
//
// Mock fetch to control detection. Verify each platform branch routes to the
// correct handler / inline orchestration.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@ava/db", () => ({
  SiteConfigRepo: {
    installShopify: vi.fn().mockResolvedValue({ id: "sc_sh_1", siteKey: "avak_sh_test" }),
    installWooCommerce: vi.fn().mockResolvedValue({ id: "sc_woo_1", siteKey: "avak_woo_test" }),
    installGenericSite: vi.fn().mockResolvedValue({ id: "sc_gen_1", siteKey: "avak_gen_test" }),
  },
  SiteCatalogRepo: {
    upsertProduct: vi.fn().mockResolvedValue({}),
  },
  SiteMapRepo: {
    upsertSiteMap: vi.fn().mockResolvedValue({}),
  },
}));

import { SiteConfigRepo, SiteCatalogRepo } from "@ava/db";
import { quickOnboard } from "./onboarding-quick.api.js";

const installGenericMock = SiteConfigRepo.installGenericSite as ReturnType<typeof vi.fn>;
const installShopifyMock = SiteConfigRepo.installShopify as ReturnType<typeof vi.fn>;
const installWooMock = SiteConfigRepo.installWooCommerce as ReturnType<typeof vi.fn>;

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

function htmlResponse(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html", ...headers } });
}
function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}
function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

const SHOPIFY_HOME = `
  <html><head>
    <meta name="generator" content="Shopify">
    <script>window.Shopify = { theme: { name: "Dawn" } };</script>
  </head><body class="template-index"></body></html>
`;
const WOO_HOME = `
  <html><head>
    <meta name="generator" content="WooCommerce 8.5.0">
    <link rel="stylesheet" href="https://shop.example/wp-content/plugins/woocommerce/x.css">
  </head><body class="home woocommerce-page"></body></html>
`;
const GENERIC_HOME = `
  <html><head><title>Some Custom Store</title></head><body>Plain.</body></html>
`;
const GENERIC_PDP = (slug: string, name: string) => `
  <html><body><script type="application/ld+json">${JSON.stringify({
    "@type": "Product", name,
    offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD", availability: "InStock" },
  })}</script></body></html>
`;

beforeEach(() => {
  installShopifyMock.mockReset().mockResolvedValue({ id: "sc_sh_1", siteKey: "avak_sh_test" });
  installWooMock.mockReset().mockResolvedValue({ id: "sc_woo_1", siteKey: "avak_woo_test" });
  installGenericMock.mockReset().mockResolvedValue({ id: "sc_gen_1", siteKey: "avak_gen_test" });
  (SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({});
});
afterEach(() => { vi.unstubAllGlobals(); });

// ── Detection routes to Shopify branch ──────────────────────────────────────

describe("POST /api/onboarding/quick — Shopify branch", () => {
  it("returns 400 with `requires: [storefrontToken]` when Shopify detected but no token", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => htmlResponse(SHOPIFY_HOME)));
    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "example.myshopify.com" }), asRes(res));
    expect(res.getStatus()).toBe(400);
    const body = res.getBody() as Record<string, unknown>;
    expect(body.requires).toEqual(["storefrontToken"]);
    expect((body.detection as Record<string, unknown>).platform).toBe("shopify");
    expect(installShopifyMock).not.toHaveBeenCalled();
  });

  it("forwards to shopifyQuickOnboard when token provided (installShopify gets called)", async () => {
    const STOREFRONT_BODY = {
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [{
            node: {
              id: "gid://shopify/Product/1",
              handle: "widget",
              title: "Widget",
              description: null, productType: null, vendor: null, tags: [],
              availableForSale: true,
              onlineStoreUrl: "https://example.myshopify.com/products/widget",
              priceRange: {
                minVariantPrice: { amount: "10.00", currencyCode: "USD" },
                maxVariantPrice: { amount: "10.00", currencyCode: "USD" },
              },
              featuredImage: null,
              variants: { edges: [] },
            },
          }],
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
      if (url.includes("/api/2024-10/graphql.json")) return jsonResponse(STOREFRONT_BODY);
      if (url.includes("sitemap")) return xmlResponse(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
      return htmlResponse(SHOPIFY_HOME, { "x-shopify-stage": "production" });
    }));

    const res = mockRes();
    await quickOnboard(asReq({
      shopUrl: "example.myshopify.com",
      storefrontToken: "shpat_test",
    }), asRes(res));

    expect(res.getStatus()).toBe(200);
    expect(installShopifyMock).toHaveBeenCalledTimes(1);
    expect((res.getBody() as Record<string, unknown>).platform).toBe("shopify");
  });
});

// ── Detection routes to Woo branch ──────────────────────────────────────────

describe("POST /api/onboarding/quick — WooCommerce branch", () => {
  it("forwards to wooCommerceQuickOnboard (installWooCommerce gets called) even without creds", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
      if (url.includes("/wp-json/wc/store/v1/products")) {
        return jsonResponse([], { "x-wp-totalpages": "1", "x-wp-total": "0" });
      }
      if (url.includes("sitemap")) return xmlResponse(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
      if (url.includes("robots.txt")) return new Response("", { status: 200, headers: { "content-type": "text/plain" } });
      return htmlResponse(WOO_HOME);
    }));

    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));

    expect(res.getStatus()).toBe(200);
    expect(installWooMock).toHaveBeenCalledTimes(1);
    expect((res.getBody() as Record<string, unknown>).platform).toBe("woocommerce");
  });
});

// ── Generic path ───────────────────────────────────────────────────────────

describe("POST /api/onboarding/quick — generic branch", () => {
  it("BFS crawls, runs structured-data ingest, returns coverage + transport='generic_crawl'", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
      if (url.endsWith("/robots.txt")) return new Response("", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.includes("sitemap")) return xmlResponse(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
      if (url.includes("/products/")) return htmlResponse(GENERIC_PDP("foo", "Foo"));
      // Homepage with a link to a PDP for BFS to follow
      return htmlResponse(`${GENERIC_HOME}<a href="/products/foo">Foo</a>`);
    }));

    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));

    expect(res.getStatus()).toBe(200);
    expect(installGenericMock).toHaveBeenCalledTimes(1);
    expect(installGenericMock.mock.calls[0]![0]!.integrationStatus).toBe("mapped");
    const body = res.getBody() as Record<string, unknown>;
    expect(body.platform).toBe("custom");
    expect(body.transport).toBe("generic_crawl");
    // Detection metadata surfaces so the wizard can show "auto-detected"
    expect((body.detection as Record<string, unknown>).platform).toBe("custom");
    // BFS picked up the homepage + the PDP we linked
    expect((body.crawl as Record<string, unknown>).pagesFetched).toBeGreaterThanOrEqual(1);
  });

  it("LLM fallback is OFF unless LLM_DOM_MAPPER_ENABLED=true in env", async () => {
    delete process.env.LLM_DOM_MAPPER_ENABLED;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => htmlResponse(GENERIC_HOME)));
    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));
    expect(res.getStatus()).toBe(200);
    // No LLM tokens consumed — we have no Groq key set in tests and the flag
    // is off, so the ingest path never attempts a call.
    const products = (res.getBody() as Record<string, Record<string, unknown>>).products;
    expect((products.bySource as Record<string, number>).llm).toBe(0);
  });
});

// ── Validation + transport failures ─────────────────────────────────────────

describe("POST /api/onboarding/quick — guards", () => {
  it("400s on schema failure (missing shopUrl)", async () => {
    const res = mockRes();
    await quickOnboard(asReq({}), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("400s when only one of consumerKey/consumerSecret is provided", async () => {
    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example", consumerKey: "ck_only" }), asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("502s when the homepage fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("DNS")));
    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example" }), asRes(res));
    expect(res.getStatus()).toBe(502);
  });

  it("normalizes shopUrl (adds https://, strips trailing slash)", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => htmlResponse(GENERIC_HOME)));
    const res = mockRes();
    await quickOnboard(asReq({ shopUrl: "shop.example/" }), asRes(res));
    expect(installGenericMock.mock.calls[0]![0]!.siteUrl).toBe("https://shop.example");
  });
});
