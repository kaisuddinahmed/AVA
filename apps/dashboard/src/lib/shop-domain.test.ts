// ============================================================================
// shop-domain — Phase 4.5.1 unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import { extractShopifyDomain } from "./shop-domain.js";

describe("extractShopifyDomain", () => {
  it("returns the *.myshopify.com host", () => {
    expect(extractShopifyDomain("https://shop-name.myshopify.com/")).toBe("shop-name.myshopify.com");
    expect(extractShopifyDomain("https://shop-name.myshopify.com/admin")).toBe("shop-name.myshopify.com");
  });

  it("lowercases the host", () => {
    expect(extractShopifyDomain("https://Shop-Name.MYSHOPIFY.com/")).toBe("shop-name.myshopify.com");
  });

  it("returns null for non-myshopify hosts (free / non-Shopify sites)", () => {
    expect(extractShopifyDomain("https://shop.example.com/")).toBeNull();
    expect(extractShopifyDomain("https://localhost:3001")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(extractShopifyDomain(null)).toBeNull();
    expect(extractShopifyDomain(undefined)).toBeNull();
    expect(extractShopifyDomain("")).toBeNull();
    expect(extractShopifyDomain("not a url")).toBeNull();
  });

  it("does NOT match shops that merely contain 'myshopify' (subdomain trick)", () => {
    // Phishing-style host that shouldn't be treated as Shopify.
    expect(extractShopifyDomain("https://myshopify.com.evil.example/")).toBeNull();
  });

  it("strips the port from the host (Codex P2 fix — uses URL.hostname, not URL.host)", () => {
    expect(extractShopifyDomain("https://shop.myshopify.com:443/")).toBe("shop.myshopify.com");
    expect(extractShopifyDomain("https://shop.myshopify.com:8443/admin")).toBe("shop.myshopify.com");
  });
});
