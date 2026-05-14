// ============================================================================
// Onboarding (Shopify quick) — integration test for the full orchestrator.
//
// Exercises POST /api/onboarding/shopify-quick end-to-end with mocked fetch
// (homepage + Storefront GraphQL + sitemap) and mocked repositories. This is
// the automated half of the Phase 1.1.6 gate; the manual half is documented
// in docs/PHASE_1_1_MANUAL_GATE.md (one-time cold-start against a real
// quickstart-*.myshopify.com store).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock repositories before importing the endpoint ─────────────────────────

vi.mock("@ava/db", () => ({
  SiteConfigRepo: {
    installShopify: vi.fn().mockResolvedValue({ id: "sc_1" }),
  },
  SiteCatalogRepo: {
    upsertProduct: vi.fn().mockResolvedValue({}),
  },
  SiteMapRepo: {
    upsertSiteMap: vi.fn().mockResolvedValue({}),
  },
}));

import { SiteConfigRepo, SiteCatalogRepo, SiteMapRepo } from "@ava/db";
import { shopifyQuickOnboard } from "./onboarding-shopify.api.js";

const installShopifyMock = SiteConfigRepo.installShopify as ReturnType<typeof vi.fn>;
const upsertProductMock = SiteCatalogRepo.upsertProduct as ReturnType<typeof vi.fn>;
const upsertSiteMapMock = SiteMapRepo.upsertSiteMap as ReturnType<typeof vi.fn>;

// ── Test doubles ────────────────────────────────────────────────────────────

// Alias the Express types so the unqualified `Response` symbol still resolves
// to the DOM `Response` constructor used below by `jsonResponse`/`xmlResponse`.
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

/** Cast helpers — the orchestrator only touches a handful of Express fields. */
const asReq = (body: unknown): ExpressReq => ({ body } as unknown as ExpressReq);
const asRes = (m: MockResponse): ExpressRes => m as unknown as ExpressRes;

function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function htmlResponse(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html", ...headers },
  });
}

function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

const SHOPIFY_HOME_HTML = `
  <html><head>
    <meta name="generator" content="Shopify">
    <script>window.Shopify = { theme: { name: "Dawn" } };</script>
  </head><body class="template-index"></body></html>
`;

const STOREFRONT_BODY = (handle: string, id: string) => ({
  data: {
    products: {
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [{
        node: {
          id, handle, title: handle.replace(/-/g, " "),
          description: null, productType: null, vendor: null, tags: [],
          availableForSale: true,
          onlineStoreUrl: `https://example.myshopify.com/products/${handle}`,
          priceRange: {
            minVariantPrice: { amount: "10.00", currencyCode: "USD" },
            maxVariantPrice: { amount: "10.00", currencyCode: "USD" },
          },
          featuredImage: null,
          variants: { edges: [{ node: {
            id: `${id}-v1`, title: "Default", sku: null,
            price: { amount: "10.00", currencyCode: "USD" },
            availableForSale: true, quantityAvailable: 5, selectedOptions: [],
          }}]},
        },
      }],
    },
  },
});

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.myshopify.com/</loc></url>
  <url><loc>https://example.myshopify.com/products/widget</loc></url>
  <url><loc>https://example.myshopify.com/products/gadget</loc></url>
  <url><loc>https://example.myshopify.com/collections/all</loc></url>
</urlset>`;

// Build a fetch router that dispatches to the right mocked response based
// on URL — mirrors how the real orchestrator hits homepage, Storefront, sitemap.
function buildFetchRouter(opts: {
  homepageResponse?: () => Response;
  storefrontResponse?: () => Response;
  sitemapResponse?: () => Response;
} = {}): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
    if (url.includes("/api/2024-10/graphql.json")) {
      return (opts.storefrontResponse ?? (() => jsonResponse(STOREFRONT_BODY("widget", "gid://shopify/Product/1"))))();
    }
    if (url.includes("/sitemap.xml")) {
      return (opts.sitemapResponse ?? (() => xmlResponse(SITEMAP_XML)))();
    }
    // Homepage probe
    return (opts.homepageResponse ?? (() => htmlResponse(SHOPIFY_HOME_HTML, {
      "x-shopify-stage": "production",
    })))();
  });
}

beforeEach(() => {
  installShopifyMock.mockReset().mockResolvedValue({ id: "sc_1", siteKey: "avak_test1234567890" });
  upsertProductMock.mockReset().mockResolvedValue({});
  upsertSiteMapMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Happy path ──────────────────────────────────────────────────────────────

describe("POST /api/onboarding/shopify-quick — happy path", () => {
  it("orchestrates detect → catalog → page-map and returns a full preview", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const req = asReq({ shopUrl: "example.myshopify.com", storefrontToken: "tok_abc" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as {
      siteUrl: string;
      siteId: string;
      siteKey: string;
      platform: string;
      detection: { platform: string; confidence: number };
      products: { ingested: number };
      sitemap: { totalUrls: number; byPageType: Record<string, { count: number; urlPattern: string }> };
      durationMs: number;
    };

    expect(body.siteUrl).toBe("https://example.myshopify.com");
    expect(body.siteId).toBe("sc_1");
    expect(body.siteKey).toBe("avak_test1234567890");
    expect(body.platform).toBe("shopify");
    expect(body.detection.platform).toBe("shopify");
    expect(body.detection.confidence).toBeGreaterThanOrEqual(0.8);
    expect(body.products.ingested).toBe(1);
    expect(body.sitemap.totalUrls).toBe(4);
    expect(body.sitemap.byPageType.pdp?.count).toBe(2);
    expect(body.sitemap.byPageType.pdp?.urlPattern).toBe("/products/:handle");
    expect(body.durationMs).toBeGreaterThanOrEqual(0);

    // Verify the orchestrator called each layer
    expect(installShopifyMock).toHaveBeenCalledWith(expect.objectContaining({
      siteUrl: "https://example.myshopify.com",
      shop: "example.myshopify.com",
      accessToken: "tok_abc",
      integrationStatus: "mapped",
    }));
    expect(upsertProductMock).toHaveBeenCalled();
    expect(upsertSiteMapMock).toHaveBeenCalled();
  });

  it("normalizes a URL with trailing slash + missing protocol", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const req = asReq({ shopUrl: "example.myshopify.com/", storefrontToken: "tok" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    const body = res.getBody() as { siteUrl: string };
    expect(body.siteUrl).toBe("https://example.myshopify.com");
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe("POST /api/onboarding/shopify-quick — validation", () => {
  it("400s on missing shopUrl", async () => {
    const req = asReq({ storefrontToken: "tok" });
    const res = mockRes();
    await shopifyQuickOnboard(req, asRes(res));
    expect(res.getStatus()).toBe(400);
  });

  it("400s on missing storefrontToken", async () => {
    const req = asReq({ shopUrl: "x.myshopify.com" });
    const res = mockRes();
    await shopifyQuickOnboard(req, asRes(res));
    expect(res.getStatus()).toBe(400);
  });
});

// ── Detection failure ───────────────────────────────────────────────────────

describe("POST /api/onboarding/shopify-quick — non-Shopify rejection", () => {
  it("400s with detection result when URL isn't a Shopify store", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      homepageResponse: () => htmlResponse("<html><body>just a brochure</body></html>"),
    }));
    const req = asReq({ shopUrl: "example.com", storefrontToken: "tok" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(400);
    const body = res.getBody() as { detection: { platform: string } };
    expect(body.detection.platform).not.toBe("shopify");
    expect(installShopifyMock).not.toHaveBeenCalled();
  });
});

// ── Storefront errors propagate as proper HTTP statuses ─────────────────────

describe("POST /api/onboarding/shopify-quick — Storefront error mapping", () => {
  it("401s and surfaces kind:unauthorized for a bad token", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      storefrontResponse: () => new Response("", { status: 401 }),
    }));
    const req = asReq({ shopUrl: "x.myshopify.com", storefrontToken: "bad" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(401);
    const body = res.getBody() as { kind: string };
    expect(body.kind).toBe("unauthorized");
  });

  it("429s and forwards retryAfterSec on rate limit", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      storefrontResponse: () => new Response("", { status: 429, headers: { "retry-after": "3" } }),
    }));
    const req = asReq({ shopUrl: "x.myshopify.com", storefrontToken: "tok" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(429);
    const body = res.getBody() as { kind: string; retryAfterSec: number };
    expect(body.kind).toBe("rate_limited");
    expect(body.retryAfterSec).toBe(3);
  });
});

// ── Sitemap-less store still works ──────────────────────────────────────────

describe("POST /api/onboarding/shopify-quick — degraded sitemap", () => {
  it("returns a valid response even if the sitemap is 404", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      sitemapResponse: () => new Response("", { status: 404 }),
    }));
    const req = asReq({ shopUrl: "x.myshopify.com", storefrontToken: "tok" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as {
      products: { ingested: number };
      sitemap: { totalUrls: number; byPageType: Record<string, unknown> };
    };
    // Catalog still ingested; sitemap section gracefully empty.
    expect(body.products.ingested).toBe(1);
    expect(body.sitemap.totalUrls).toBe(0);
    expect(body.sitemap.byPageType).toEqual({});
  });
});

// ── Phase 1.1.6 gate criteria (assertions) ─────────────────────────────────

describe("Phase 1.1.6 gate — automated criteria", () => {
  it("cold-start completes well under 5 minutes (mocked path)", async () => {
    vi.stubGlobal("fetch", buildFetchRouter());
    const req = asReq({ shopUrl: "example.myshopify.com", storefrontToken: "tok" });
    const res = mockRes();

    const t0 = Date.now();
    await shopifyQuickOnboard(req, asRes(res));
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(5 * 60 * 1000);
    const body = res.getBody() as { durationMs: number };
    expect(body.durationMs).toBeLessThan(5 * 60 * 1000);
  });

  it("SiteMap is populated with the four key pageTypes when present in sitemap", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({
      sitemapResponse: () => xmlResponse(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.myshopify.com/</loc></url>
        <url><loc>https://example.myshopify.com/products/widget</loc></url>
        <url><loc>https://example.myshopify.com/collections/all</loc></url>
        <url><loc>https://example.myshopify.com/cart</loc></url>
      </urlset>`),
    }));
    const req = asReq({ shopUrl: "example.myshopify.com", storefrontToken: "tok" });
    const res = mockRes();

    await shopifyQuickOnboard(req, asRes(res));

    const body = res.getBody() as {
      sitemap: { byPageType: Record<string, { confidence: number }> };
    };
    expect(body.sitemap.byPageType.home).toBeDefined();
    expect(body.sitemap.byPageType.pdp).toBeDefined();
    expect(body.sitemap.byPageType.category).toBeDefined();
    expect(body.sitemap.byPageType.cart).toBeDefined();
    // Each detected type must clear the 0.7 mapping-confidence threshold.
    for (const pt of ["home", "pdp", "category", "cart"] as const) {
      expect(body.sitemap.byPageType[pt].confidence).toBeGreaterThanOrEqual(0.7);
    }
  });
});
