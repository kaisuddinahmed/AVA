// ============================================================================
// shop-domain — Phase 4.5.1 helper.
//
// Extract a Shopify shop domain (`*.myshopify.com`) from an AVA siteUrl.
// Used by the billing UI to call `/api/billing/{start,callback,status}`
// which all key off shopDomain rather than the AVA siteUrl.
//
// Returns null when:
//   - the siteUrl isn't parseable
//   - the host isn't a *.myshopify.com domain (free / non-Shopify sites
//     can't subscribe via Shopify Billing API)
// ============================================================================

export function extractShopifyDomain(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const u = new URL(siteUrl);
    // Codex P2 fix: use `hostname` not `host`. `host` includes the port
    // when present (e.g. "shop.myshopify.com:443"), which would fail the
    // suffix check incorrectly.
    const hostname = u.hostname.toLowerCase();
    return hostname.endsWith(".myshopify.com") ? hostname : null;
  } catch {
    return null;
  }
}
