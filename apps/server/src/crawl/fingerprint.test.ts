// ============================================================================
// Fingerprint capture — unit tests against real fixtures + edges.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

vi.mock("@ava/db", () => ({
  SiteSelectorFingerprintRepo: {
    upsertFingerprint: vi.fn(),
  },
}));

import { SiteSelectorFingerprintRepo } from "@ava/db";
import { captureFingerprint, persistFingerprint } from "./fingerprint.service.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "fixtures", name), "utf-8");

const upsertMock = SiteSelectorFingerprintRepo.upsertFingerprint as ReturnType<typeof vi.fn>;

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
});

// ── Determinism + structure ─────────────────────────────────────────────────

describe("captureFingerprint — hash determinism", () => {
  it("returns the same hash for identical input", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const a = captureFingerprint(html, "pdp");
    const b = captureFingerprint(html, "pdp");
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores text content — same shape, different copy, same hash", () => {
    const baseHtml = `<html><body class="template-product"><h1 class="product__title">A</h1></body></html>`;
    const dupHtml = baseHtml.replace(">A<", ">Completely different product copy<");
    const a = captureFingerprint(baseHtml, "pdp");
    const b = captureFingerprint(dupHtml, "pdp");
    expect(a.hash).toBe(b.hash);
  });

  it("changes hash when DOM structure changes", () => {
    const a = captureFingerprint(
      `<html><body class="template-product"><h1>Product</h1></body></html>`,
      "pdp",
    );
    const b = captureFingerprint(
      `<html><body class="template-product"><h1>Product</h1><div class="new-section">X</div></body></html>`,
      "pdp",
    );
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("captureFingerprint — data shape", () => {
  it("captures tag counts, class frequencies, attr signatures, schema types", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const r = captureFingerprint(html, "pdp");

    expect(r.data.tagCounts.div).toBeGreaterThan(0);
    expect(r.data.tagCounts.h1).toBeGreaterThanOrEqual(1);
    expect(r.data.classFrequencies["template-product"]).toBe(1);
    expect(r.data.attrSignatures).toContain("form[action=/cart/add]");
    expect(r.data.attrSignatures).toContain("data-product-form");
    expect(r.data.attrSignatures).toContain("script[type=application/ld+json]");
    expect(r.data.schemaTypes).toContain("Product");
  });

  it("filters auto-generated noise classes from the fingerprint", () => {
    const html = `
      <html><body class="template-product">
        <div class="real-class css-1q2w3e4r sc-abcd1234">x</div>
      </body></html>
    `;
    const r = captureFingerprint(html, "pdp");
    expect(r.data.classFrequencies["real-class"]).toBe(1);
    expect(r.data.classFrequencies["css-1q2w3e4r"]).toBeUndefined();
    expect(r.data.classFrequencies["sc-abcd1234"]).toBeUndefined();
  });

  it("KEEPS semantic ecommerce class names even when 8+ chars (regression: Codex)", () => {
    // Earlier `NOISE_CLASS = /^[a-z0-9]{8,}$/` dropped real classes that
    // happen to be 8 chars of pure letters. That weakened drift detection
    // on the exact classes that matter most.
    const html = `
      <html><body>
        <ul class="products columns-3">
          <li class="cartitem">x</li>
        </ul>
        <button class="checkout">y</button>
        <div class="bootstrap5">z</div>
      </body></html>
    `;
    const r = captureFingerprint(html, "category");
    expect(r.data.classFrequencies["products"]).toBe(1);
    expect(r.data.classFrequencies["checkout"]).toBe(1);
    expect(r.data.classFrequencies["cartitem"]).toBe(1);
    expect(r.data.classFrequencies["bootstrap5"]).toBe(1); // word+version stays
  });

  it("still drops genuine hash-like classes (8+ chars with mixed digits)", () => {
    const html = `<div class="a1B2c3D4 normal-class __next_internal_a1b2c3 jsx-1234567 styled-cls">x</div>`;
    const r = captureFingerprint(html, "pdp");
    expect(r.data.classFrequencies["normal-class"]).toBe(1);
    expect(r.data.classFrequencies["styled-cls"]).toBe(1);
    expect(r.data.classFrequencies["a1b2c3d4"]).toBeUndefined();
    expect(r.data.classFrequencies["__next_internal_a1b2c3"]).toBeUndefined();
    expect(r.data.classFrequencies["jsx-1234567"]).toBeUndefined();
  });
});

// ── Selector inference per pageType ────────────────────────────────────────

describe("inferSelectors — Shopify PDP", () => {
  it("identifies add-to-cart, price, title, image", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const r = captureFingerprint(html, "pdp");
    expect(r.selectors.addToCart).toBe("form[action='/cart/add'] button[name='add']");
    expect(r.selectors.price).toBe(".price-item--regular");
    expect(r.selectors.productTitle).toBe("h1.product__title");
    expect(r.selectors.productImage).toBe(".product__media img");
  });
});

describe("inferSelectors — WooCommerce PDP", () => {
  it("identifies Woo-specific selectors", () => {
    const html = fixture("woocommerce-pdp-storefront.html");
    const r = captureFingerprint(html, "pdp");
    expect(r.selectors.addToCart).toBe("button.single_add_to_cart_button");
    expect(r.selectors.price).toBe(".woocommerce-Price-amount");
    expect(r.selectors.productTitle).toBe("h1.product_title");
    expect(r.selectors.productImage).toBe(".woocommerce-product-gallery img");
  });
});

describe("inferSelectors — Shopify collection / category", () => {
  it("identifies product grid + card", () => {
    const html = fixture("shopify-collection-dawn.html");
    const r = captureFingerprint(html, "category");
    expect(r.selectors.productGrid).toBe("#product-grid");
    expect(r.selectors.productCard).toBe(".grid__item");
  });
});

describe("inferSelectors — Shopify cart", () => {
  it("identifies cart line, subtotal, checkout button", () => {
    const html = fixture("shopify-cart-dawn.html");
    const r = captureFingerprint(html, "cart");
    expect(r.selectors.cartLine).toBe("[data-cart-line]");
    expect(r.selectors.cartSubtotal).toBe(".totals__subtotal-value");
    expect(r.selectors.checkoutButton).toBe("button[name='checkout']");
  });
});

describe("inferSelectors — Shopify checkout", () => {
  it("identifies checkout form", () => {
    const html = fixture("shopify-checkout-dawn.html");
    const r = captureFingerprint(html, "checkout");
    expect(r.selectors.loginForm).toBe("form[data-checkout-form]");
  });
});

describe("inferSelectors — fallbacks", () => {
  it("returns empty selectors when no rules match", () => {
    const html = `<html><body><div>no markers</div></body></html>`;
    const r = captureFingerprint(html, "pdp");
    expect(r.selectors).toEqual({});
  });

  it("returns empty selectors for 'other' page type", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const r = captureFingerprint(html, "other");
    expect(r.selectors).toEqual({});
  });

  it("first matching rule wins (no override by weaker matchers)", () => {
    const html = `
      <html><body>
        <button class="product-form__submit">add</button>
        <button class="single_add_to_cart_button">also add</button>
      </body></html>
    `;
    const r = captureFingerprint(html, "pdp");
    // PDP_RULES order: form[action=/cart/add] > product-form__submit > single_add_to_cart_button
    expect(r.selectors.addToCart).toBe("button.product-form__submit");
  });
});

// ── Persistence ─────────────────────────────────────────────────────────────

describe("persistFingerprint", () => {
  it("upserts via SiteSelectorFingerprintRepo with stringified JSON", async () => {
    const capture = captureFingerprint(fixture("shopify-pdp-dawn.html"), "pdp");
    await persistFingerprint("https://example.myshopify.com", "pdp", capture);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0]![0];
    expect(arg.siteUrl).toBe("https://example.myshopify.com");
    expect(arg.pageType).toBe("pdp");
    expect(arg.fingerprintHash).toBe(capture.hash);
    expect(JSON.parse(arg.fingerprintData)).toEqual(capture.data);
    expect(JSON.parse(arg.selectors)).toEqual(capture.selectors);
  });

  it("swallows upsert failures — drift capture must not block the crawler", async () => {
    upsertMock.mockReset();
    upsertMock.mockRejectedValue(new Error("db down"));
    const capture = captureFingerprint(fixture("shopify-pdp-dawn.html"), "pdp");
    // No throw expected
    await expect(persistFingerprint("https://x.test", "pdp", capture)).resolves.toBeUndefined();
  });
});
