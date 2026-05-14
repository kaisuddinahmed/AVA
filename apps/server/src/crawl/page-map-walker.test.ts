// ============================================================================
// Page-map walker — unit tests with mocked SiteMapRepo + fetch.
// Tests cover: sitemap discovery, sitemap-index recursion (depth bound),
// URL-only classification, pageType grouping, confidence scaling, error
// isolation, and persistence shape.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@ava/db", () => ({
  SiteMapRepo: {
    upsertSiteMap: vi.fn(),
  },
}));

import { SiteMapRepo } from "@ava/db";
import { walkPageMap } from "./page-map-walker.service.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "fixtures", name), "utf-8");

const upsertMock = SiteMapRepo.upsertSiteMap as ReturnType<typeof vi.fn>;

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/xml" } });
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
});

// ── Happy path: real sitemap fixture ────────────────────────────────────────

describe("walkPageMap — Shopify sitemap fixture", () => {
  it("classifies + groups URLs and persists one SiteMap row per pageType", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(fixture("sitemap-shopify.xml")));

    const result = await walkPageMap({
      siteUrl: "https://example-store.myshopify.com",
      fetchImpl: fetchMock,
    });

    // Sitemap fixture has 8 URLs total: 1 home + 2 collections + 3 products + 1 page + 1 blog
    // After "other" is dropped, we keep: home(1) + category(2) + pdp(3) = 6
    expect(result.totalUrls).toBe(8);
    expect(result.classifiedUrls).toBe(6);

    expect(result.byPageType.pdp?.count).toBe(3);
    expect(result.byPageType.pdp?.urlPattern).toBe("/products/:handle");
    expect(result.byPageType.pdp?.samples.length).toBe(3);
    expect(result.byPageType.pdp?.confidence).toBeGreaterThanOrEqual(0.75);

    expect(result.byPageType.category?.count).toBe(2);
    expect(result.byPageType.category?.urlPattern).toBe("/collections/:handle");

    expect(result.byPageType.home?.count).toBe(1);
    expect(result.byPageType.home?.urlPattern).toBe("/");

    // 3 distinct pageTypes persisted (pdp, category, home). "other" types not persisted.
    expect(upsertMock).toHaveBeenCalledTimes(3);
  });

  it("derives the correct sitemap URL from siteUrl when not provided", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(fixture("sitemap-shopify.xml")));
    await walkPageMap({ siteUrl: "https://example.myshopify.com", fetchImpl: fetchMock });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.myshopify.com/sitemap.xml");
  });

  it("respects an explicit sitemapUrl override", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(fixture("sitemap-shopify.xml")));
    await walkPageMap({
      siteUrl: "https://example.myshopify.com",
      sitemapUrl: "https://example.myshopify.com/sitemap_products_1.xml",
      fetchImpl: fetchMock,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.myshopify.com/sitemap_products_1.xml");
  });
});

// ── Sitemap-index recursion (depth bound) ───────────────────────────────────

describe("walkPageMap — sitemap-index recursion", () => {
  it("follows one level of sitemapindex children", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      // Root: sitemapindex → 2 children
      .mockResolvedValueOnce(xmlResponse(fixture("sitemap-index.xml")))
      // First child sitemap — 2 PDP URLs
      .mockResolvedValueOnce(xmlResponse(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example-shop.com/product/oak-cutting-board/</loc></url>
        <url><loc>https://example-shop.com/product/walnut-spatula/</loc></url>
      </urlset>`))
      // remaining children of the index — empty urlsets
      .mockResolvedValue(xmlResponse(`<urlset></urlset>`));

    const result = await walkPageMap({
      siteUrl: "https://example-shop.com",
      sitemapUrl: "https://example-shop.com/sitemap_index.xml",
      fetchImpl: fetchMock,
    });

    expect(result.sitemapsFetched).toBeGreaterThanOrEqual(2);
    expect(result.byPageType.pdp?.count).toBe(2);
    expect(result.byPageType.pdp?.urlPattern).toBe("/products/:handle");
  });

  it("does not recurse into a nested sitemapindex (depth-1 cap)", async () => {
    // Root sitemap-index → points to another sitemap-index → which has urls
    const rootIndex = `<sitemapindex><sitemap><loc>https://x.test/level1.xml</loc></sitemap></sitemapindex>`;
    const level1Index = `<sitemapindex><sitemap><loc>https://x.test/level2.xml</loc></sitemap></sitemapindex>`;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(xmlResponse(rootIndex))
      .mockResolvedValueOnce(xmlResponse(level1Index));

    const result = await walkPageMap({
      siteUrl: "https://x.test",
      sitemapUrl: "https://x.test/sitemap.xml",
      fetchImpl: fetchMock,
    });

    expect(result.totalUrls).toBe(0);
    // Fetched the root + level1 index, but did NOT fetch level2 (depth-1 cap)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── Confidence scaling ──────────────────────────────────────────────────────

describe("walkPageMap — confidence", () => {
  it("scales confidence by URL count (log-shaped)", async () => {
    const manyPdps = (n: number) => `<?xml version="1.0"?><urlset>${
      Array.from({ length: n }, (_, i) => `<url><loc>https://x.test/products/p${i}</loc></url>`).join("")
    }</urlset>`;

    // 1 URL → ~0.75
    upsertMock.mockReset();
    const fetchMock1 = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(manyPdps(1)));
    const r1 = await walkPageMap({ siteUrl: "https://x.test", sitemapUrl: "https://x.test/sm.xml", fetchImpl: fetchMock1 });
    expect(r1.byPageType.pdp?.confidence).toBeCloseTo(0.75, 2);

    // 100+ URLs → capped at 0.95
    upsertMock.mockReset();
    const fetchMock2 = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(manyPdps(100)));
    const r2 = await walkPageMap({ siteUrl: "https://x.test", sitemapUrl: "https://x.test/sm.xml", fetchImpl: fetchMock2 });
    expect(r2.byPageType.pdp?.confidence).toBe(0.95);
  });
});

// ── Persistence shape ───────────────────────────────────────────────────────

describe("walkPageMap — persistence", () => {
  it("upserts each pageType with sampleUrls JSON and SQL-safe defaults", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(fixture("sitemap-shopify.xml")));
    await walkPageMap({ siteUrl: "https://example.myshopify.com", fetchImpl: fetchMock });

    const calls = upsertMock.mock.calls;
    const pdpCall = calls.find(([arg]) => arg.pageType === "pdp")![0];
    expect(pdpCall).toMatchObject({
      siteUrl: "https://example.myshopify.com",
      pageType: "pdp",
      urlPattern: "/products/:handle",
      keySelectors: "{}",
      pageCount: 3,
    });
    expect(JSON.parse(pdpCall.sampleUrls)).toEqual(expect.arrayContaining([
      "https://example-store.myshopify.com/products/raw-linen-tee",
    ]));
  });

  it("caps samples at 5 even when many URLs match", async () => {
    const manyPdps = `<urlset>${
      Array.from({ length: 20 }, (_, i) => `<url><loc>https://x.test/products/p${i}</loc></url>`).join("")
    }</urlset>`;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(manyPdps));
    await walkPageMap({ siteUrl: "https://x.test", sitemapUrl: "https://x.test/sm.xml", fetchImpl: fetchMock });
    const pdpCall = upsertMock.mock.calls.find(([arg]) => arg.pageType === "pdp")![0];
    expect(JSON.parse(pdpCall.sampleUrls).length).toBe(5);
    expect(pdpCall.pageCount).toBe(20);
  });
});

// ── Error isolation ─────────────────────────────────────────────────────────

describe("walkPageMap — failure modes", () => {
  it("returns an empty result when the sitemap is unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
    const result = await walkPageMap({
      siteUrl: "https://x.test",
      sitemapUrl: "https://x.test/sm.xml",
      fetchImpl: fetchMock,
    });
    expect(result.totalUrls).toBe(0);
    expect(result.byPageType).toEqual({});
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("tolerates a malformed sitemap body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse("not xml"));
    const result = await walkPageMap({
      siteUrl: "https://x.test",
      sitemapUrl: "https://x.test/sm.xml",
      fetchImpl: fetchMock,
    });
    expect(result.totalUrls).toBe(0);
  });

  it("isolates per-pageType upsert failures", async () => {
    upsertMock.mockReset();
    // Reject the first call, accept the rest
    upsertMock.mockRejectedValueOnce(new Error("constraint"));
    upsertMock.mockResolvedValue({});

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(xmlResponse(fixture("sitemap-shopify.xml")));
    const result = await walkPageMap({
      siteUrl: "https://example.myshopify.com",
      fetchImpl: fetchMock,
    });

    // Result still computed correctly — the failed upsert is logged + skipped.
    expect(Object.keys(result.byPageType).length).toBeGreaterThan(0);
  });
});
