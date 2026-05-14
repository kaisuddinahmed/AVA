// ============================================================================
// Platform detection — classify a shop's e-commerce platform from HTML
// markers, response headers, and hostname patterns.
//
// PURE function. Caller fetches the shop's home page (or any page), and
// hands HTML + response headers in. This keeps tests deterministic — no
// HTTP fixtures, no flake.
//
// Three signal layers, vote-and-saturate (same shape as page classifier):
//   1. Hostname  — *.myshopify.com is definitive; custom domains need more.
//   2. Headers   — x-shopify-stage / x-sorting-hat-shopid / x-shardid.
//   3. HTML      — window.Shopify global, meta[generator], cdn.shopify.com,
//                   WooCommerce body class, /wp-content/plugins/woocommerce.
//
// Used by:
//   - wizard quick-onboarding endpoint (Phase 1.1.5)
//   - generic-adapter fallback (Phase 1.5)
// ============================================================================
// ---------------------------------------------------------------------------
// Signal weights — calibrated so a single definitive signal (myshopify.com
// hostname OR a Shopify header) clears the 0.8 acceptance gate.
// ---------------------------------------------------------------------------
const W_DEFINITIVE_HOST = 1.2; // *.myshopify.com — guaranteed Shopify
const W_PLATFORM_HEADER = 1.0; // x-shopify-stage etc.
const W_HTML_STRONG = 0.55; // window.Shopify, meta[generator=Shopify]
const W_HTML_MEDIUM = 0.4; // cdn.shopify.com URL, body template-* class
const W_HTML_WEAK = 0.2; // shopify-section, single CSS hint
const CONFIDENCE_CEILING = 0.95;
// Slightly higher than the page classifier's 1.6 — a single definitive
// platform signal (x-shopify-stage header, or *.myshopify.com host) should
// clear the 0.8 acceptance gate on its own.
const CONFIDENCE_SATURATION = 1.7;
function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return null;
    }
}
function lowerKeys(headers) {
    if (!headers)
        return {};
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        out[k.toLowerCase()] = String(v);
    }
    return out;
}
// ---------------------------------------------------------------------------
// Layer 1 — hostname
// ---------------------------------------------------------------------------
function voteByHostname(url) {
    const host = getHostname(url);
    if (!host)
        return [];
    const votes = [];
    if (host.endsWith(".myshopify.com")) {
        votes.push({ platform: "shopify", weight: W_DEFINITIVE_HOST, reason: "host:myshopify.com" });
    }
    // WooCommerce has no equivalent hostname signal — it runs on any WP host.
    return votes;
}
// ---------------------------------------------------------------------------
// Layer 2 — response headers
// ---------------------------------------------------------------------------
function voteByHeaders(headers) {
    const votes = [];
    // Shopify CDN / routing markers — these are emitted by Shopify's edge for
    // every storefront response. Their presence is near-definitive.
    if (headers["x-shopify-stage"]) {
        votes.push({ platform: "shopify", weight: W_PLATFORM_HEADER, reason: "header:x-shopify-stage" });
    }
    if (headers["x-sorting-hat-shopid"] || headers["x-sorting-hat-podid"]) {
        votes.push({ platform: "shopify", weight: W_PLATFORM_HEADER, reason: "header:x-sorting-hat" });
    }
    if (headers["x-shardid"]) {
        votes.push({ platform: "shopify", weight: W_HTML_MEDIUM, reason: "header:x-shardid" });
    }
    if (/^Shop(ify)?/i.test(headers["powered-by"] ?? "")) {
        votes.push({ platform: "shopify", weight: W_HTML_STRONG, reason: "header:powered-by-shopify" });
    }
    // WooCommerce → WordPress headers + Link to wp-json
    const link = headers["link"] ?? "";
    if (/<https?:\/\/[^>]+\/wp-json\/?>;/i.test(link)) {
        votes.push({ platform: "woocommerce", weight: W_HTML_MEDIUM, reason: "header:wp-json-link" });
    }
    if (/^WordPress/i.test(headers["x-powered-by"] ?? "")) {
        votes.push({ platform: "woocommerce", weight: W_HTML_WEAK, reason: "header:x-powered-by-wordpress" });
    }
    return votes;
}
// ---------------------------------------------------------------------------
// Layer 3 — HTML markers
// ---------------------------------------------------------------------------
function voteByHtml(html) {
    if (!html)
        return [];
    const votes = [];
    // --- Shopify HTML signals ---
    if (/window\.Shopify\s*=/.test(html)) {
        votes.push({ platform: "shopify", weight: W_HTML_STRONG, reason: "html:window.Shopify" });
    }
    if (/<meta[^>]+name\s*=\s*["']generator["'][^>]+content\s*=\s*["']Shopify\b/i.test(html)) {
        votes.push({ platform: "shopify", weight: W_HTML_STRONG, reason: "html:meta-generator-shopify" });
    }
    if (/\/\/cdn\.shopify\.com\//.test(html)) {
        votes.push({ platform: "shopify", weight: W_HTML_MEDIUM, reason: "html:cdn.shopify.com" });
    }
    // Shopify body class convention: template-* matches a Shopify template family.
    if (/<body\b[^>]*\bclass\s*=\s*["'][^"']*\btemplate-(?:index|product|collection|cart|customers|page|blog|article|search)\b/i.test(html)) {
        votes.push({ platform: "shopify", weight: W_HTML_MEDIUM, reason: "html:body-template-class" });
    }
    if (/\bshopify-section\b/.test(html) || /\bShopify\.theme\b/.test(html)) {
        votes.push({ platform: "shopify", weight: W_HTML_WEAK, reason: "html:shopify-section" });
    }
    // --- WooCommerce HTML signals ---
    if (/<meta[^>]+name\s*=\s*["']generator["'][^>]+content\s*=\s*["']WooCommerce\b/i.test(html)) {
        votes.push({ platform: "woocommerce", weight: W_HTML_STRONG, reason: "html:meta-generator-woocommerce" });
    }
    if (/<body\b[^>]*\bclass\s*=\s*["'][^"']*\bwoocommerce(?:-page|-cart|-checkout|-account)?\b/i.test(html)) {
        votes.push({ platform: "woocommerce", weight: W_HTML_MEDIUM, reason: "html:body-woocommerce" });
    }
    if (/\/wp-content\/plugins\/woocommerce\//.test(html)) {
        votes.push({ platform: "woocommerce", weight: W_HTML_STRONG, reason: "html:wp-content-woocommerce" });
    }
    if (/<link[^>]+href\s*=\s*["'][^"']*\/wp-json\//.test(html)) {
        votes.push({ platform: "woocommerce", weight: W_HTML_WEAK, reason: "html:wp-json-link" });
    }
    return votes;
}
// ---------------------------------------------------------------------------
// Combine
// ---------------------------------------------------------------------------
function combine(votes) {
    if (votes.length === 0) {
        return { platform: "custom", confidence: 0, signals: [] };
    }
    const perPlatform = new Map();
    for (const v of votes) {
        const cur = perPlatform.get(v.platform) ?? { total: 0, reasons: [] };
        cur.total += v.weight;
        cur.reasons.push(v.reason);
        perPlatform.set(v.platform, cur);
    }
    let best = "custom";
    let bestTotal = 0;
    let bestReasons = [];
    for (const [p, info] of perPlatform) {
        if (info.total > bestTotal) {
            bestTotal = info.total;
            best = p;
            bestReasons = info.reasons;
        }
    }
    const confidence = Math.min(CONFIDENCE_CEILING, 1 - Math.exp(-bestTotal * CONFIDENCE_SATURATION));
    return { platform: best, confidence: round3(confidence), signals: bestReasons };
}
function round3(n) {
    return Math.round(n * 1000) / 1000;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Detect the e-commerce platform for a given shop URL using whatever signals
 * the caller has gathered. All inputs except `url` are optional — the
 * detection degrades gracefully (lower confidence) when fewer signals are
 * available.
 *
 * Returns `platform: "custom"` with `confidence: 0` when no signals fire.
 */
export function detectPlatform(input) {
    const headers = lowerKeys(input.headers);
    const votes = [
        ...voteByHostname(input.url),
        ...voteByHeaders(headers),
        ...voteByHtml(input.html ?? ""),
    ];
    return combine(votes);
}
//# sourceMappingURL=platform-detect.service.js.map