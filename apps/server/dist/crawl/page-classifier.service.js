// ============================================================================
// Page Classifier — turns raw HTML + URL into a typed page kind with
// a confidence score. Used by the crawler/wizard during onboarding and by
// the widget at runtime to recognize what page the visitor is on.
//
// Design: three independent signal layers vote with weighted confidences.
// We then take the strongest type and combine evidence to produce a final
// 0..1 confidence (cap 0.95 — leave headroom for false positives).
//
//   1. URL pattern      — strong for known platforms (/products/:handle, /cart).
//   2. DOM fingerprint  — body class, key forms, meta tags. Platform-agnostic.
//   3. JSON-LD @type    — strongest single signal when present.
//
// Pure function, zero deps. Input HTML may be partial/truncated.
// ============================================================================
// JSON-LD wins ties — it's the most-specific signal a site can publish.
const W_JSON_LD = 0.55;
const W_BODY_CLASS = 0.5;
const W_URL_PATTERN = 0.4;
const W_FORM_OR_GLOBAL = 0.35;
const W_OG_TYPE = 0.2;
// Cap the final confidence — never claim certainty from heuristics alone.
const CONFIDENCE_CEILING = 0.95;
// Saturation rate in the exponential. Calibrated so that two independent
// strong signals (≥0.45 each) clear the 0.8 acceptance gate.
const CONFIDENCE_SATURATION = 1.6;
// ---------------------------------------------------------------------------
// Layer 1 — URL pattern
// ---------------------------------------------------------------------------
function voteByUrl(rawUrl) {
    let path;
    try {
        path = new URL(rawUrl).pathname.toLowerCase();
    }
    catch {
        // Tolerate path-only inputs ("/products/foo")
        path = rawUrl.startsWith("/") ? rawUrl.toLowerCase() : "/";
    }
    // Shopify checkout uses /checkouts/<token>, Shopify cart is exactly /cart
    if (/\/checkouts?\//.test(path) || /\/checkout(\/|$)/.test(path)) {
        return { type: "checkout", weight: W_URL_PATTERN, reason: "url:checkout" };
    }
    if (/^\/cart(\/|$|\?)/.test(path)) {
        return { type: "cart", weight: W_URL_PATTERN, reason: "url:cart" };
    }
    // PDP — Shopify /products/:handle, Woo /product/:slug
    if (/\/products?\/[^/]+/.test(path)) {
        return { type: "pdp", weight: W_URL_PATTERN, reason: "url:pdp" };
    }
    // Category — Shopify /collections/:handle, Woo /product-category/:slug, generic /category/:slug
    if (/\/collections?\/[^/]+/.test(path) ||
        /\/product-category\/[^/]+/.test(path) ||
        /\/category\/[^/]+/.test(path) ||
        /\/shop(\/|$)/.test(path)) {
        return { type: "category", weight: W_URL_PATTERN, reason: "url:category" };
    }
    // Search
    if (/\/search(\/|$)/.test(path) || /[?&](q|s|query)=/.test(rawUrl.toLowerCase())) {
        return { type: "search_results", weight: W_URL_PATTERN, reason: "url:search" };
    }
    // Account
    if (/\/account(\/|$)/.test(path) || /\/my-account(\/|$)/.test(path) || /\/wp-login/.test(path)) {
        return { type: "account", weight: W_URL_PATTERN, reason: "url:account" };
    }
    // Home
    if (path === "/" || path === "") {
        return { type: "home", weight: W_URL_PATTERN, reason: "url:home" };
    }
    return null;
}
// ---------------------------------------------------------------------------
// Layer 2 — DOM fingerprint (body class, key forms, JS globals, meta)
// ---------------------------------------------------------------------------
function extractBodyClasses(html) {
    const m = html.match(/<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i);
    return m ? m[1].toLowerCase() : "";
}
function extractMetaContent(html, propOrName, value) {
    // Try property="og:type"
    const reProp = new RegExp(`<meta[^>]+property\\s*=\\s*["']${value}["'][^>]+content\\s*=\\s*["']([^"']+)["']`, "i");
    const reName = new RegExp(`<meta[^>]+name\\s*=\\s*["']${value}["'][^>]+content\\s*=\\s*["']([^"']+)["']`, "i");
    const reRev = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:${propOrName})\\s*=\\s*["']${value}["']`, "i");
    return (html.match(reProp)?.[1] ?? html.match(reName)?.[1] ?? html.match(reRev)?.[1] ?? null);
}
function voteByDom(html) {
    const votes = [];
    const bodyClass = extractBodyClasses(html);
    // -------------- Shopify body-class markers --------------
    if (/\btemplate-product\b/.test(bodyClass)) {
        votes.push({ type: "pdp", weight: W_BODY_CLASS, reason: "body:template-product" });
    }
    if (/\btemplate-collection\b/.test(bodyClass)) {
        votes.push({ type: "category", weight: W_BODY_CLASS, reason: "body:template-collection" });
    }
    if (/\btemplate-cart\b/.test(bodyClass)) {
        votes.push({ type: "cart", weight: W_BODY_CLASS, reason: "body:template-cart" });
    }
    if (/\btemplate-search\b/.test(bodyClass)) {
        votes.push({ type: "search_results", weight: W_BODY_CLASS, reason: "body:template-search" });
    }
    if (/\btemplate-customers/.test(bodyClass) || /\btemplate-account\b/.test(bodyClass)) {
        votes.push({ type: "account", weight: W_BODY_CLASS, reason: "body:template-customer" });
    }
    if (/\btemplate-index\b/.test(bodyClass)) {
        votes.push({ type: "home", weight: W_BODY_CLASS, reason: "body:template-index" });
    }
    // Shopify Checkout has body class "checkout" (one-page) or "step-*"
    if (/(^|\s)checkout(\s|$)/.test(bodyClass) || /\bstep-(contact|shipping|payment)/.test(bodyClass)) {
        votes.push({ type: "checkout", weight: W_BODY_CLASS, reason: "body:checkout" });
    }
    // -------------- WooCommerce body-class markers --------------
    if (/\bsingle-product\b/.test(bodyClass)) {
        votes.push({ type: "pdp", weight: W_BODY_CLASS, reason: "body:single-product" });
    }
    if (/\b(?:tax-product_cat|post-type-archive-product|archive\s+tax-product_cat)\b/.test(bodyClass) ||
        (/\barchive\b/.test(bodyClass) && /\btax-product_cat\b/.test(bodyClass))) {
        votes.push({ type: "category", weight: W_BODY_CLASS, reason: "body:woo-archive" });
    }
    if (/\bwoocommerce-cart\b/.test(bodyClass)) {
        votes.push({ type: "cart", weight: W_BODY_CLASS, reason: "body:woocommerce-cart" });
    }
    if (/\bwoocommerce-checkout\b/.test(bodyClass)) {
        votes.push({ type: "checkout", weight: W_BODY_CLASS, reason: "body:woocommerce-checkout" });
    }
    if (/\bwoocommerce-account\b/.test(bodyClass)) {
        votes.push({ type: "account", weight: W_BODY_CLASS, reason: "body:woocommerce-account" });
    }
    // -------------- Form / global markers --------------
    // Add-to-cart form anywhere on the page is strong PDP evidence.
    if (/<form[^>]+action\s*=\s*["']\/cart\/add\b/i.test(html) ||
        /\b(?:single_add_to_cart_button|product-form__submit)\b/.test(html) ||
        /\bdata-product-form\b/.test(html)) {
        votes.push({ type: "pdp", weight: W_FORM_OR_GLOBAL, reason: "form:add-to-cart" });
    }
    // Cart form action
    if (/<form[^>]+action\s*=\s*["']\/cart\b["']/i.test(html) || /\bdata-cart-line\b/.test(html)) {
        votes.push({ type: "cart", weight: W_FORM_OR_GLOBAL, reason: "form:cart" });
    }
    // WooCommerce category grid — <ul class="products"> or <ul class="products columns-N">
    // Distinct from Shopify's .product-grid; a strong category-page corroborator
    // when Storefront-class themes omit JSON-LD ItemList.
    if (/<(?:ul|div)[^>]+class\s*=\s*["'][^"']*\bproducts(?:\s+columns-\d+)?\b/i.test(html)) {
        votes.push({ type: "category", weight: W_FORM_OR_GLOBAL, reason: "dom:woo-products-grid" });
    }
    // Shopify Checkout JS global is a near-certain marker
    if (/window\.Shopify\.Checkout\s*=/.test(html) || /data-checkout-form\b/.test(html)) {
        votes.push({ type: "checkout", weight: W_FORM_OR_GLOBAL + 0.1, reason: "global:Shopify.Checkout" });
    }
    // -------------- Open Graph fallback --------------
    const ogType = extractMetaContent(html, "property", "og:type");
    if (ogType === "product") {
        votes.push({ type: "pdp", weight: W_OG_TYPE, reason: "og:type=product" });
    }
    return votes;
}
// ---------------------------------------------------------------------------
// Layer 3 — JSON-LD @type
// ---------------------------------------------------------------------------
function voteByJsonLd(html) {
    const votes = [];
    const scriptRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = scriptRe.exec(html)) !== null) {
        const raw = m[1].trim();
        if (!raw)
            continue;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            continue;
        }
        for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
            const t = extractType(node);
            if (!t)
                continue;
            switch (t) {
                case "Product":
                    votes.push({ type: "pdp", weight: W_JSON_LD, reason: "json-ld:Product" });
                    break;
                case "ItemList":
                case "CollectionPage":
                    votes.push({ type: "category", weight: W_JSON_LD, reason: `json-ld:${t}` });
                    break;
                case "SearchResultsPage":
                    votes.push({ type: "search_results", weight: W_JSON_LD, reason: "json-ld:SearchResultsPage" });
                    break;
                case "WebSite":
                    // Often present on home pages alongside other markers — weak vote.
                    votes.push({ type: "home", weight: W_OG_TYPE, reason: "json-ld:WebSite" });
                    break;
            }
        }
    }
    return votes;
}
function extractType(node) {
    if (!node || typeof node !== "object")
        return null;
    const t = node["@type"];
    if (typeof t === "string")
        return t;
    if (Array.isArray(t)) {
        const first = t.find((x) => typeof x === "string");
        return typeof first === "string" ? first : null;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Combine votes
// ---------------------------------------------------------------------------
function combine(votes) {
    if (votes.length === 0) {
        return { pageType: "other", confidence: 0, signals: [] };
    }
    // Sum weights per type — diminishing returns to prevent runaway confidence.
    const perType = new Map();
    for (const v of votes) {
        const cur = perType.get(v.type) ?? { total: 0, reasons: [] };
        cur.total += v.weight;
        cur.reasons.push(v.reason);
        perType.set(v.type, cur);
    }
    let bestType = "other";
    let bestTotal = 0;
    let bestReasons = [];
    for (const [type, info] of perType) {
        if (info.total > bestTotal) {
            bestTotal = info.total;
            bestType = type;
            bestReasons = info.reasons;
        }
    }
    // Map raw weighted sum → 0..1 with saturation. A single strong signal
    // (0.55) lands ~0.59, two agreeing signals (~1.0) land ~0.80,
    // three saturate near the ceiling. See CONFIDENCE_SATURATION calibration.
    const confidence = Math.min(CONFIDENCE_CEILING, 1 - Math.exp(-bestTotal * CONFIDENCE_SATURATION));
    return { pageType: bestType, confidence: round3(confidence), signals: bestReasons };
}
function round3(n) {
    return Math.round(n * 1000) / 1000;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Classify a page given its raw HTML and canonical URL.
 *
 * `html` may be the full document or a truncated chunk — the classifier only
 * needs the `<head>` plus body class to fire most signals. Returns the
 * single best-fit page type with a 0..1 confidence and the list of signals
 * that contributed.
 */
export function classifyPage(html, url) {
    const votes = [];
    const urlVote = voteByUrl(url);
    if (urlVote)
        votes.push(urlVote);
    votes.push(...voteByDom(html));
    votes.push(...voteByJsonLd(html));
    return combine(votes);
}
//# sourceMappingURL=page-classifier.service.js.map