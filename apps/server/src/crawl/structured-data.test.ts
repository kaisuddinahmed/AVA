// ============================================================================
// Structured-data extractor — unit tests + real-fixture verification.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  extractStructuredData,
  extractJsonLd,
  extractMicrodata,
  extractOpenGraph,
  jsonLdTypes,
} from "./structured-data.extractor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "fixtures", name), "utf-8");

// ── JSON-LD ─────────────────────────────────────────────────────────────────

describe("extractJsonLd — basic shapes", () => {
  it("parses a single Product node", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org/","@type":"Product","name":"Widget","offers":{"price":"9"}}
    </script>`;
    const nodes = extractJsonLd(html);
    expect(nodes.length).toBe(1);
    expect(nodes[0]["@type"]).toBe("Product");
    expect(nodes[0].name).toBe("Widget");
  });

  it("flattens a top-level array into multiple nodes", () => {
    const html = `<script type="application/ld+json">
      [
        {"@type":"Product","name":"A"},
        {"@type":"Product","name":"B"}
      ]
    </script>`;
    const nodes = extractJsonLd(html);
    expect(nodes.length).toBe(2);
    expect(nodes.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("unwraps @graph and exposes inner nodes at top level", () => {
    // Closes task #39 — many real ecommerce pages use this envelope.
    const html = `<script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", "name": "Brand" },
          { "@type": "Product", "name": "Widget", "offers": { "price": "9" } },
          { "@type": "BreadcrumbList", "itemListElement": [] }
        ]
      }
    </script>`;
    const nodes = extractJsonLd(html);
    expect(nodes.length).toBe(3);
    expect(jsonLdTypes(nodes)).toEqual(["Organization", "Product", "BreadcrumbList"]);
  });

  it("handles nested @graph inside an array", () => {
    const html = `<script type="application/ld+json">
      [
        { "@graph": [{ "@type": "Product", "name": "Inner" }] },
        { "@type": "WebSite", "name": "Outer" }
      ]
    </script>`;
    const nodes = extractJsonLd(html);
    expect(jsonLdTypes(nodes)).toEqual(["Product", "WebSite"]);
  });

  it("supports @type as an array", () => {
    const html = `<script type="application/ld+json">
      {"@type":["Product","Thing"],"name":"X"}
    </script>`;
    const nodes = extractJsonLd(html);
    expect(nodes[0]["@type"]).toEqual(["Product", "Thing"]);
    expect(jsonLdTypes(nodes)).toEqual(["Product", "Thing"]);
  });

  it("skips malformed blocks without throwing", () => {
    const html = `
      <script type="application/ld+json">{ broken json }</script>
      <script type="application/ld+json">{"@type":"Product","name":"OK"}</script>
    `;
    const nodes = extractJsonLd(html);
    expect(nodes.length).toBe(1);
    expect(nodes[0].name).toBe("OK");
  });

  it("drops nodes without @type", () => {
    const html = `<script type="application/ld+json">
      {"name":"missing-type"}
    </script>`;
    expect(extractJsonLd(html).length).toBe(0);
  });

  it("returns empty array for empty/non-JSON-LD pages", () => {
    expect(extractJsonLd("")).toEqual([]);
    expect(extractJsonLd("<html><body>no ld+json here</body></html>")).toEqual([]);
  });
});

// ── OpenGraph ───────────────────────────────────────────────────────────────

describe("extractOpenGraph", () => {
  it("extracts og:* meta tags as a flat record", () => {
    const html = `
      <meta property="og:type" content="product">
      <meta property="og:title" content="Raw Linen Tee">
      <meta property="og:image" content="https://cdn.example.com/img.jpg">
    `;
    expect(extractOpenGraph(html)).toEqual({
      type: "product",
      title: "Raw Linen Tee",
      image: "https://cdn.example.com/img.jpg",
    });
  });

  it("handles content-before-property attribute order", () => {
    const html = `<meta content="article" property="og:type">`;
    expect(extractOpenGraph(html).type).toBe("article");
  });

  it("respects document-order last-wins regardless of attribute order (regression: Codex)", () => {
    // Earlier two-pass implementation processed property-before-content
    // tags first and gated content-before-property behind `if (!(key in out))`,
    // so this returned "old". Document order should win.
    const html = `
      <meta property="og:title" content="old">
      <meta content="new" property="og:title">
    `;
    expect(extractOpenGraph(html).title).toBe("new");
  });

  it("repeated og:image keeps the last value", () => {
    const html = `
      <meta property="og:image" content="first.jpg">
      <meta property="og:image" content="second.jpg">
      <meta property="og:image" content="third.jpg">
    `;
    expect(extractOpenGraph(html).image).toBe("third.jpg");
  });

  it("ignores non-og meta tags", () => {
    const html = `
      <meta name="generator" content="WooCommerce">
      <meta property="twitter:card" content="summary">
      <meta property="og:title" content="ok">
    `;
    expect(extractOpenGraph(html)).toEqual({ title: "ok" });
  });
});

// ── Microdata ───────────────────────────────────────────────────────────────

describe("extractMicrodata", () => {
  it("extracts a single Product with simple text properties", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Walnut Spatula</h1>
        <span itemprop="sku">WD-WS-12</span>
      </div>
    `;
    const items = extractMicrodata(html);
    expect(items.length).toBe(1);
    expect(items[0]["@type"]).toBe("Product");
    expect(items[0].properties.name).toBe("Walnut Spatula");
    expect(items[0].properties.sku).toBe("WD-WS-12");
  });

  it("pulls values from attributes for meta/a/img/time elements", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <meta itemprop="brand" content="Heritage Wood Co.">
        <a itemprop="url" href="/product/spatula">link</a>
        <img itemprop="image" src="/img/spatula.jpg" alt="">
        <time itemprop="releaseDate" datetime="2026-01-15">Jan 15</time>
      </div>
    `;
    const items = extractMicrodata(html);
    const p = items[0].properties;
    expect(p.brand).toBe("Heritage Wood Co.");
    expect(p.url).toBe("/product/spatula");
    expect(p.image).toBe("/img/spatula.jpg");
    expect(p.releaseDate).toBe("2026-01-15");
  });

  it("nests itemscope children as inner items", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Oak Board</span>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <span itemprop="price">42.00</span>
          <span itemprop="priceCurrency">USD</span>
        </div>
      </div>
    `;
    const items = extractMicrodata(html);
    const offers = items[0].properties.offers;
    expect(typeof offers).toBe("object");
    expect((offers as { "@type": string })["@type"]).toBe("Offer");
    expect((offers as { properties: Record<string, string> }).properties.price).toBe("42.00");
  });

  it("collects repeated properties into an array", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="tag">linen</span>
        <span itemprop="tag">summer</span>
        <span itemprop="tag">new</span>
      </div>
    `;
    const items = extractMicrodata(html);
    expect(items[0].properties.tag).toEqual(["linen", "summer", "new"]);
  });

  it("returns empty array when no microdata is present", () => {
    expect(extractMicrodata("<html><body>no itemscope here</body></html>")).toEqual([]);
  });
});

// ── Composite (real fixtures) ───────────────────────────────────────────────

describe("extractStructuredData — real fixtures", () => {
  it("Shopify Dawn PDP: JSON-LD Product + OG product + no microdata", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const data = extractStructuredData(html);
    expect(jsonLdTypes(data.jsonLd)).toContain("Product");
    expect(data.openGraph.type).toBe("product");
    expect(data.openGraph.title).toBe("Raw Linen Tee");
    expect(data.microdata).toEqual([]); // Dawn uses JSON-LD, not microdata
  });

  it("Shopify Dawn collection: JSON-LD ItemList", () => {
    const html = fixture("shopify-collection-dawn.html");
    const data = extractStructuredData(html);
    expect(jsonLdTypes(data.jsonLd)).toContain("ItemList");
  });

  it("WooCommerce Storefront PDP: JSON-LD Product + OG product", () => {
    const html = fixture("woocommerce-pdp-storefront.html");
    const data = extractStructuredData(html);
    expect(jsonLdTypes(data.jsonLd)).toContain("Product");
    expect(data.openGraph.type).toBe("product");
  });

  it("Shopify cart fixture has none of the structured signals (cart pages are inventory of session, not catalog)", () => {
    const html = fixture("shopify-cart-dawn.html");
    const data = extractStructuredData(html);
    expect(data.jsonLd).toEqual([]);
    expect(data.openGraph).toEqual({});
    expect(data.microdata).toEqual([]);
  });
});
