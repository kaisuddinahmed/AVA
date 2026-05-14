// ============================================================================
// Page classifier — fixture-driven tests + edge cases.
//
// The fixture cases double as the Phase 1.0 acceptance gate: every shipped
// fixture must classify to the expected pageType with confidence ≥ 0.8.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyPage } from "./page-classifier.service.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "fixtures", name), "utf-8");
const PHASE_1_GATE_CONFIDENCE = 0.8;
const FIXTURES = [
    {
        file: "shopify-pdp-dawn.html",
        url: "https://example-store.myshopify.com/products/raw-linen-tee",
        expectedType: "pdp",
        mustHaveSignal: "json-ld:Product",
    },
    {
        file: "shopify-collection-dawn.html",
        url: "https://example-store.myshopify.com/collections/tops",
        expectedType: "category",
        mustHaveSignal: "json-ld:ItemList",
    },
    {
        file: "shopify-cart-dawn.html",
        url: "https://example-store.myshopify.com/cart",
        expectedType: "cart",
        mustHaveSignal: "body:template-cart",
    },
    {
        file: "shopify-checkout-dawn.html",
        url: "https://example-store.myshopify.com/checkouts/c/Z2NwLXVzLWNlbnRyYWwx",
        expectedType: "checkout",
        mustHaveSignal: "global:Shopify.Checkout",
    },
    {
        file: "woocommerce-pdp-storefront.html",
        url: "https://example-shop.com/product/oak-cutting-board/",
        expectedType: "pdp",
        mustHaveSignal: "body:single-product",
    },
    {
        file: "woocommerce-category-storefront.html",
        url: "https://example-shop.com/product-category/kitchen/",
        expectedType: "category",
        mustHaveSignal: "dom:woo-products-grid",
    },
];
describe("classifyPage — Phase 1.0 fixture gate", () => {
    for (const c of FIXTURES) {
        it(`${c.file} → ${c.expectedType} @ confidence ≥ ${PHASE_1_GATE_CONFIDENCE}`, () => {
            const result = classifyPage(fixture(c.file), c.url);
            expect(result.pageType).toBe(c.expectedType);
            expect(result.confidence).toBeGreaterThanOrEqual(PHASE_1_GATE_CONFIDENCE);
            if (c.mustHaveSignal) {
                expect(result.signals).toContain(c.mustHaveSignal);
            }
        });
    }
});
// ── URL-only classification (catalog rows from sitemap walk, no HTML yet) ───
describe("classifyPage — URL-only inputs", () => {
    it("classifies a Shopify PDP path with no HTML", () => {
        const r = classifyPage("", "https://store.example.com/products/leather-belt");
        expect(r.pageType).toBe("pdp");
        expect(r.signals).toContain("url:pdp");
    });
    it("classifies a WooCommerce category path with no HTML", () => {
        const r = classifyPage("", "https://shop.example.com/product-category/jackets/");
        expect(r.pageType).toBe("category");
    });
    it("classifies the homepage with no HTML", () => {
        const r = classifyPage("", "https://store.example.com/");
        expect(r.pageType).toBe("home");
    });
    it("classifies a search URL via ?q= query param", () => {
        const r = classifyPage("", "https://store.example.com/?q=tee");
        expect(r.pageType).toBe("search_results");
    });
    it("tolerates a path-only string (no host)", () => {
        const r = classifyPage("", "/products/loafer-tan");
        expect(r.pageType).toBe("pdp");
    });
});
// ── JSON-LD edge cases ──────────────────────────────────────────────────────
describe("classifyPage — JSON-LD edges", () => {
    it("accepts @type as an array (e.g. ['Product', 'Thing'])", () => {
        const html = `<html><body>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":["Product","Thing"],"name":"X","offers":{"price":"9"}}
      </script>
    </body></html>`;
        const r = classifyPage(html, "https://x.test/items/abc");
        // Product → pdp; URL also picks up "items" doesn't match — but JSON-LD alone is enough
        expect(r.signals).toContain("json-ld:Product");
    });
    it("skips malformed JSON-LD blocks without throwing", () => {
        const html = `<html><body>
      <script type="application/ld+json">{ this is not json }</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
    </body></html>`;
        const r = classifyPage(html, "https://x.test/products/abc");
        expect(r.pageType).toBe("pdp");
    });
    it("does not fire JSON-LD signal when no <script type='application/ld+json'> present", () => {
        const r = classifyPage("<html><body class='template-product'></body></html>", "https://x.test/products/abc");
        expect(r.signals).not.toContain("json-ld:Product");
        expect(r.pageType).toBe("pdp");
    });
});
// ── Conflicting signals: classifier picks the strongest ─────────────────────
describe("classifyPage — conflicting signals", () => {
    it("trusts JSON-LD Product over a misleading URL path", () => {
        // Shop hosts product on a custom path; JSON-LD remains canonical.
        const html = `<html><body>
      <script type="application/ld+json">
        {"@type":"Product","offers":{"price":"10"}}
      </script>
    </body></html>`;
        const r = classifyPage(html, "https://x.test/some/marketing/page");
        expect(r.pageType).toBe("pdp");
    });
    it("falls back to 'other' when no signals fire", () => {
        const r = classifyPage("<html><body></body></html>", "https://x.test/random/path");
        expect(r.pageType).toBe("other");
        expect(r.confidence).toBe(0);
    });
});
// ── Confidence shape ────────────────────────────────────────────────────────
describe("classifyPage — confidence calibration", () => {
    it("never exceeds the ceiling (0.95)", () => {
        // Stack every signal we can — JSON-LD + body + URL + form + OG + Shopify
        const html = `<html><body class="template-product">
      <meta property="og:type" content="product">
      <script type="application/ld+json">{"@type":"Product","offers":{"price":"9"}}</script>
      <form action="/cart/add" data-product-form></form>
    </body></html>`;
        const r = classifyPage(html, "https://example.myshopify.com/products/x");
        expect(r.confidence).toBeLessThanOrEqual(0.95);
        expect(r.confidence).toBeGreaterThan(0.9);
    });
    it("returns lower confidence when only one signal fires", () => {
        // Just a URL pattern — no DOM, no JSON-LD
        const r = classifyPage("", "https://x.test/products/a");
        expect(r.confidence).toBeLessThan(PHASE_1_GATE_CONFIDENCE);
        expect(r.confidence).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=page-classifier.test.js.map