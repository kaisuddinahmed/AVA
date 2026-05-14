// ============================================================================
// Sitemap parser — unit tests against real fixture files.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSitemap } from "./sitemap.parser.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf-8");
describe("parseSitemap — urlset", () => {
    const xml = fixture("sitemap-shopify.xml");
    const result = parseSitemap(xml);
    it("detects urlset kind", () => {
        expect(result?.kind).toBe("urlset");
    });
    it("extracts every <url> entry", () => {
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls.length).toBe(8);
    });
    it("parses loc and lastmod fields", () => {
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        const pdp = result.urls.find((u) => u.loc.endsWith("/products/raw-linen-tee"));
        expect(pdp).toBeDefined();
        expect(pdp?.lastmod).toBeInstanceOf(Date);
        expect(pdp?.changefreq).toBe("daily");
    });
    it("ignores <image:image> extension blocks (only <url> entries count)", () => {
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        // The shopify fixture has one PDP url with an <image:image> child; that
        // shouldn't inflate the URL count or appear as a separate entry.
        const locs = result.urls.map((u) => u.loc);
        expect(new Set(locs).size).toBe(locs.length);
    });
});
describe("parseSitemap — sitemapindex", () => {
    const xml = fixture("sitemap-index.xml");
    const result = parseSitemap(xml);
    it("detects sitemapindex kind", () => {
        expect(result?.kind).toBe("sitemapindex");
    });
    it("extracts every <sitemap> child reference", () => {
        if (result?.kind !== "sitemapindex")
            throw new Error("expected sitemapindex");
        expect(result.sitemaps.length).toBe(4);
        expect(result.sitemaps[0].loc).toBe("https://example-shop.com/product-sitemap.xml");
        expect(result.sitemaps[0].lastmod).toBeInstanceOf(Date);
    });
});
describe("parseSitemap — XML entity decoding", () => {
    it("decodes &amp; in loc URLs (Google query-string PDPs)", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example.com/?p=42&amp;variant=red</loc></url>
</urlset>`;
        const result = parseSitemap(xml);
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls[0].loc).toBe("https://shop.example.com/?p=42&variant=red");
    });
    it("decodes numeric character refs", () => {
        const xml = `<urlset><url><loc>https://x.test/a&#x2F;b</loc></url></urlset>`;
        const result = parseSitemap(xml);
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls[0].loc).toBe("https://x.test/a/b");
    });
});
describe("parseSitemap — tolerant of namespace prefixes", () => {
    it("accepts <ns0:urlset>/<ns0:url>/<ns0:loc> style", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ns0:urlset xmlns:ns0="http://www.sitemaps.org/schemas/sitemap/0.9">
  <ns0:url><ns0:loc>https://x.test/one</ns0:loc></ns0:url>
  <ns0:url><ns0:loc>https://x.test/two</ns0:loc></ns0:url>
</ns0:urlset>`;
        const result = parseSitemap(xml);
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls.map((u) => u.loc)).toEqual([
            "https://x.test/one",
            "https://x.test/two",
        ]);
    });
});
describe("parseSitemap — malformed input", () => {
    it("returns null for empty input", () => {
        expect(parseSitemap("")).toBeNull();
    });
    it("returns null for non-XML text", () => {
        expect(parseSitemap("404 Not Found")).toBeNull();
    });
    it("returns null for XML without a sitemap root", () => {
        expect(parseSitemap("<?xml version=\"1.0\"?><foo><bar/></foo>")).toBeNull();
    });
    it("skips <url> entries that lack <loc>", () => {
        const xml = `<urlset>
      <url><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://x.test/keep</loc></url>
    </urlset>`;
        const result = parseSitemap(xml);
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls.length).toBe(1);
        expect(result.urls[0].loc).toBe("https://x.test/keep");
    });
    it("ignores invalid priority values", () => {
        const xml = `<urlset><url><loc>https://x.test/</loc><priority>nope</priority></url></urlset>`;
        const result = parseSitemap(xml);
        if (result?.kind !== "urlset")
            throw new Error("expected urlset");
        expect(result.urls[0].priority).toBeUndefined();
    });
});
//# sourceMappingURL=sitemap.parser.test.js.map