// ============================================================================
// Platform detection — unit tests covering hostname, header, and HTML layers.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectPlatform } from "./platform-detect.service.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "fixtures", name), "utf-8");

const GATE_CONFIDENCE = 0.8;

describe("detectPlatform — hostname layer", () => {
  it("hits *.myshopify.com with high confidence even on bare URL", () => {
    const r = detectPlatform({ url: "https://example-store.myshopify.com/" });
    expect(r.platform).toBe("shopify");
    expect(r.confidence).toBeGreaterThanOrEqual(GATE_CONFIDENCE);
    expect(r.signals).toContain("host:myshopify.com");
  });

  it("does not fire Shopify host signal on custom domains", () => {
    const r = detectPlatform({ url: "https://shop.brand.com/" });
    expect(r.signals).not.toContain("host:myshopify.com");
  });
});

describe("detectPlatform — headers layer", () => {
  it("recognizes x-shopify-stage on a custom domain", () => {
    const r = detectPlatform({
      url: "https://shop.brand.com/",
      headers: { "x-shopify-stage": "production" },
    });
    expect(r.platform).toBe("shopify");
    expect(r.confidence).toBeGreaterThanOrEqual(GATE_CONFIDENCE);
    expect(r.signals).toContain("header:x-shopify-stage");
  });

  it("recognizes the WP REST link header for WooCommerce", () => {
    const r = detectPlatform({
      url: "https://shop.brand.com/",
      headers: { link: "<https://shop.brand.com/wp-json/>; rel=\"https://api.w.org/\"" },
    });
    expect(r.platform).toBe("woocommerce");
    expect(r.signals).toContain("header:wp-json-link");
  });

  it("is case-insensitive on header keys", () => {
    const r = detectPlatform({
      url: "https://shop.brand.com/",
      headers: { "X-Shopify-Stage": "production" },
    });
    expect(r.platform).toBe("shopify");
  });
});

describe("detectPlatform — HTML layer (real fixtures)", () => {
  it("detects Shopify from the Dawn PDP fixture", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const r = detectPlatform({ url: "https://shop.brand.com/products/x", html });
    expect(r.platform).toBe("shopify");
    expect(r.confidence).toBeGreaterThanOrEqual(GATE_CONFIDENCE);
    // The fixture has window.Shopify, meta generator, cdn.shopify.com, body
    // template-product, and Shopify.theme — multiple corroborating signals.
    expect(r.signals).toEqual(
      expect.arrayContaining([
        "html:window.Shopify",
        "html:meta-generator-shopify",
        "html:cdn.shopify.com",
      ]),
    );
  });

  it("detects WooCommerce from the Storefront PDP fixture", () => {
    const html = fixture("woocommerce-pdp-storefront.html");
    const r = detectPlatform({ url: "https://shop.brand.com/product/x/", html });
    expect(r.platform).toBe("woocommerce");
    expect(r.confidence).toBeGreaterThanOrEqual(GATE_CONFIDENCE);
    expect(r.signals).toEqual(
      expect.arrayContaining([
        "html:meta-generator-woocommerce",
        "html:body-woocommerce",
      ]),
    );
  });
});

describe("detectPlatform — multi-layer corroboration", () => {
  it("scores higher when hostname + header + HTML all agree", () => {
    const html = fixture("shopify-pdp-dawn.html");
    const r = detectPlatform({
      url: "https://example-store.myshopify.com/products/x",
      html,
      headers: { "x-shopify-stage": "production", "x-sorting-hat-shopid": "12345" },
    });
    expect(r.platform).toBe("shopify");
    expect(r.confidence).toBeCloseTo(0.95, 2); // saturates at ceiling
  });
});

describe("detectPlatform — null cases", () => {
  it("returns custom + confidence 0 when nothing fires", () => {
    const r = detectPlatform({
      url: "https://example.com/",
      html: "<html><body>Just a brochure site.</body></html>",
      headers: { "content-type": "text/html" },
    });
    expect(r.platform).toBe("custom");
    expect(r.confidence).toBe(0);
    expect(r.signals.length).toBe(0);
  });

  it("tolerates a malformed URL by skipping the hostname layer", () => {
    const r = detectPlatform({
      url: "not a url",
      headers: { "x-shopify-stage": "production" },
    });
    expect(r.platform).toBe("shopify");
  });

  it("returns custom when only signals are weak conflicting hints", () => {
    // No definitive marker — just a Shopify-section-like class with no other context
    const html = `<html><body><div class="shopify-section">x</div></body></html>`;
    const r = detectPlatform({ url: "https://example.com/", html });
    expect(r.platform).toBe("shopify");
    // Single weak signal — should NOT clear the gate
    expect(r.confidence).toBeLessThan(GATE_CONFIDENCE);
  });
});
