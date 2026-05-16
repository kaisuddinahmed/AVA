// ============================================================================
// generic-product.extractor — unit tests.
// Deterministic only: JSON-LD → microdata → OpenGraph, in that priority.
// ============================================================================
import { describe, it, expect } from "vitest";
import { extractGenericProduct } from "./generic-product.extractor.js";
const URL_PDP = "https://shop.example.com/products/raw-linen-tee";
// ── JSON-LD path ────────────────────────────────────────────────────────────
describe("extractGenericProduct — JSON-LD", () => {
    it("extracts a single-offer Product node", () => {
        const html = `
      <html><head>
        <script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Raw Linen Tee",
            description: "Lightweight.",
            image: "https://cdn.example.com/img.jpg",
            offers: {
                "@type": "Offer",
                price: "48.00",
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
            },
        })}</script>
      </head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p).not.toBeNull();
        expect(p).toMatchObject({
            title: "Raw Linen Tee",
            description: "Lightweight.",
            imageUrl: "https://cdn.example.com/img.jpg",
            priceMin: 48,
            priceMax: 48,
            currency: "USD",
            availability: "in_stock",
            handle: "raw-linen-tee",
            sourceSignal: "jsonld",
        });
        // externalId is namespaced by host+path so it never collides across sites.
        expect(p.externalId).toBe("generic:shop.example.com/products/raw-linen-tee");
    });
    it("handles AggregateOffer with lowPrice/highPrice", () => {
        const html = `
      <html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "Variable Product",
            offers: {
                "@type": "AggregateOffer",
                lowPrice: "29.99",
                highPrice: "79.99",
                priceCurrency: "EUR",
                availability: "https://schema.org/OutOfStock",
            },
        })}</script></head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p.priceMin).toBe(29.99);
        expect(p.priceMax).toBe(79.99);
        expect(p.currency).toBe("EUR");
        expect(p.availability).toBe("out_of_stock");
    });
    it("handles an array of Offer nodes by collapsing to min/max", () => {
        const html = `
      <html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "Multi-Offer",
            offers: [
                { "@type": "Offer", price: "15.00", priceCurrency: "USD", availability: "InStock" },
                { "@type": "Offer", price: "25.00", priceCurrency: "USD", availability: "InStock" },
                { "@type": "Offer", price: "10.00", priceCurrency: "USD", availability: "InStock" },
            ],
        })}</script></head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p.priceMin).toBe(10);
        expect(p.priceMax).toBe(25);
    });
    it("unwraps @graph wrappers and finds the nested Product", () => {
        const html = `
      <html><head><script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
                { "@type": "BreadcrumbList", itemListElement: [] },
                { "@type": "Product", name: "Graph Product", offers: { "@type": "Offer", price: "11", priceCurrency: "USD" } },
            ],
        })}</script></head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p.title).toBe("Graph Product");
        expect(p.priceMin).toBe(11);
    });
    it("accepts an image object with a `url` field (Shopify-style)", () => {
        const html = `
      <html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "Imaged",
            image: { url: "https://cdn.example.com/i.jpg" },
            offers: { "@type": "Offer", price: "10", priceCurrency: "USD" },
        })}</script></head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p.imageUrl).toBe("https://cdn.example.com/i.jpg");
    });
    it("returns null when the Product node has no name (refuse to invent)", () => {
        const html = `
      <html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            offers: { "@type": "Offer", price: "10", priceCurrency: "USD" },
        })}</script></head><body></body></html>
    `;
        expect(extractGenericProduct(URL_PDP, html)).toBeNull();
    });
});
// ── Microdata path ─────────────────────────────────────────────────────────
describe("extractGenericProduct — microdata", () => {
    it("extracts a Product itemtype with nested Offer", () => {
        const html = `
      <html><body>
        <div itemscope itemtype="http://schema.org/Product">
          <meta itemprop="name" content="Linen Tee Micro" />
          <meta itemprop="description" content="From microdata." />
          <meta itemprop="image" content="https://cdn.example.com/m.jpg" />
          <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
            <meta itemprop="price" content="42.50" />
            <meta itemprop="priceCurrency" content="GBP" />
            <link itemprop="availability" href="http://schema.org/InStock" />
          </div>
        </div>
      </body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p).toMatchObject({
            title: "Linen Tee Micro",
            description: "From microdata.",
            imageUrl: "https://cdn.example.com/m.jpg",
            priceMin: 42.5,
            priceMax: 42.5,
            currency: "GBP",
            availability: "in_stock",
            sourceSignal: "microdata",
        });
    });
});
// ── OpenGraph fallback ─────────────────────────────────────────────────────
describe("extractGenericProduct — OpenGraph fallback", () => {
    it("extracts a product:* OG record when no JSON-LD / microdata present", () => {
        const html = `
      <html><head>
        <meta property="og:type" content="product" />
        <meta property="og:title" content="OG Linen Tee" />
        <meta property="og:image" content="https://cdn.example.com/og.jpg" />
        <meta property="product:price:amount" content="33.00" />
        <meta property="product:price:currency" content="CAD" />
        <meta property="product:availability" content="instock" />
      </head><body></body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p).toMatchObject({
            title: "OG Linen Tee",
            imageUrl: "https://cdn.example.com/og.jpg",
            priceMin: 33,
            priceMax: 33,
            currency: "CAD",
            availability: "in_stock",
            sourceSignal: "opengraph",
        });
    });
    it("returns null when og:type is not product (no hallucinated articles)", () => {
        const html = `
      <html><head>
        <meta property="og:type" content="article" />
        <meta property="og:title" content="A Blog Post" />
      </head></html>
    `;
        expect(extractGenericProduct(URL_PDP, html)).toBeNull();
    });
});
// ── Signal priority ────────────────────────────────────────────────────────
describe("extractGenericProduct — signal priority", () => {
    it("prefers JSON-LD over microdata over OpenGraph when multiple are present", () => {
        const html = `
      <html><head>
        <meta property="og:type" content="product" />
        <meta property="og:title" content="OG Title" />
        <script type="application/ld+json">${JSON.stringify({
            "@type": "Product",
            name: "JsonLd Title",
            offers: { "@type": "Offer", price: "10", priceCurrency: "USD" },
        })}</script>
      </head><body>
        <div itemscope itemtype="http://schema.org/Product">
          <meta itemprop="name" content="Microdata Title" />
        </div>
      </body></html>
    `;
        const p = extractGenericProduct(URL_PDP, html);
        expect(p.title).toBe("JsonLd Title");
        expect(p.sourceSignal).toBe("jsonld");
    });
});
// ── Empty / non-product page ───────────────────────────────────────────────
describe("extractGenericProduct — no structured data", () => {
    it("returns null when the page has nothing usable", () => {
        expect(extractGenericProduct(URL_PDP, `<html><body><h1>Welcome</h1></body></html>`)).toBeNull();
    });
    it("returns null on empty input", () => {
        expect(extractGenericProduct(URL_PDP, "")).toBeNull();
    });
});
// ── URL handling ────────────────────────────────────────────────────────────
describe("extractGenericProduct — externalId stability", () => {
    it("normalizes trailing slashes when building externalId", () => {
        const baseHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product", name: "X",
            offers: { "@type": "Offer", price: "1", priceCurrency: "USD" },
        })}</script></head></html>`;
        const a = extractGenericProduct("https://x.test/products/foo/", baseHtml);
        const b = extractGenericProduct("https://x.test/products/foo", baseHtml);
        expect(a.externalId).toBe(b.externalId);
    });
    it("namespaces externalId with the host so two sites can have the same slug", () => {
        const baseHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "Product", name: "X",
            offers: { "@type": "Offer", price: "1", priceCurrency: "USD" },
        })}</script></head></html>`;
        const a = extractGenericProduct("https://a.test/products/foo", baseHtml);
        const b = extractGenericProduct("https://b.test/products/foo", baseHtml);
        expect(a.externalId).not.toBe(b.externalId);
    });
});
//# sourceMappingURL=generic-product.test.js.map