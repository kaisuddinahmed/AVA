// ============================================================================
// Selector fingerprint capture — SHA-256 of normalized DOM skeleton +
// per-pageType selector inference.
//
// Phase 1.2.4. The fingerprint persists to SiteSelectorFingerprint so Phase
// 1.5 can compare new captures against baseline and raise drift alerts when
// the DOM shape changes meaningfully.
//
// "Normalized skeleton" = tag counts + class frequencies + form/ID signals,
// stripped of text + attribute values. We're capturing STRUCTURE, not
// content. Two PDPs for different products on the same theme produce the
// same hash; a theme update changes the hash.
//
// Zero deps beyond node:crypto (Node 20 stdlib).
// ============================================================================
import { createHash } from "node:crypto";
import { SiteSelectorFingerprintRepo } from "@ava/db";
import { logger } from "../logger.js";
import { extractJsonLd, jsonLdTypes } from "./structured-data.extractor.js";
const log = logger.child({ service: "crawl" });
// ---------------------------------------------------------------------------
// Capture (pure)
// ---------------------------------------------------------------------------
/**
 * Compute a fingerprint for a single page. Pure: HTML + pageType in,
 * structured result out. Persistence is `persistFingerprint()` below.
 */
export function captureFingerprint(html, pageType) {
    const data = {
        tagCounts: countTags(html),
        classFrequencies: countClasses(html),
        attrSignatures: collectAttrSignatures(html),
        schemaTypes: jsonLdTypes(extractJsonLd(html)),
    };
    const hash = hashFingerprint(data);
    const selectors = inferSelectors(html, pageType);
    return { hash, data, selectors };
}
/**
 * Persist a fingerprint capture. Wraps the repo so callers don't need to
 * stringify JSON or remember the column shape.
 */
export async function persistFingerprint(siteUrl, pageType, capture) {
    try {
        await SiteSelectorFingerprintRepo.upsertFingerprint({
            siteUrl,
            pageType,
            fingerprintHash: capture.hash,
            fingerprintData: JSON.stringify(capture.data),
            selectors: JSON.stringify(capture.selectors),
        });
    }
    catch (err) {
        log.warn({ err, siteUrl, pageType }, "[Fingerprint] upsert failed");
    }
}
// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
function hashFingerprint(data) {
    // Canonicalize: sort keys + arrays for stable hashing across captures.
    const canonical = {
        tagCounts: sortObj(data.tagCounts),
        classFrequencies: sortObj(data.classFrequencies),
        attrSignatures: [...data.attrSignatures].sort(),
        schemaTypes: [...data.schemaTypes].sort(),
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function sortObj(obj) {
    const out = {};
    for (const k of Object.keys(obj).sort())
        out[k] = obj[k];
    return out;
}
// ---------------------------------------------------------------------------
// Tag + class extraction
// ---------------------------------------------------------------------------
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b/g;
const CLASS_RE = /\bclass\s*=\s*["']([^"']+)["']/gi;
// Classes that look auto-generated (hash suffixes, build IDs). We exclude
// these from the fingerprint so build-noise doesn't cause false drift.
//
// Critical: keep real semantic class names like `products`, `checkout`,
// `cartitem` — those ARE legitimate ecommerce classes even though they're
// 8+ chars. The noise heuristic only fires when a class has:
//   - a known framework prefix (css-, sc-, __next_), OR
//   - 8+ chars AND contains digits AND has no hyphens/underscores AND
//     isn't a clean `word + version` suffix like `bootstrap5`.
function isNoiseClass(cls) {
    // Framework / build-tool fingerprints
    if (/^css-[a-z0-9-]+$/i.test(cls))
        return true; // emotion / CSS-in-JS
    if (/^sc-[a-z0-9]+/i.test(cls))
        return true; // styled-components
    if (/^__[\w]+_[a-f0-9]+$/i.test(cls))
        return true; // Next.js __className_HASH
    if (/^jsx-\d+$/i.test(cls))
        return true; // styled-jsx
    // Hash-like: 8+ chars, has digits, no hyphens/underscores, alphanumeric,
    // and not a clean `word + version` ending (e.g. "bootstrap5" should stay).
    if (cls.length >= 8 &&
        /^[a-z0-9]+$/i.test(cls) &&
        /\d/.test(cls) &&
        !/^[a-z]+\d+$/i.test(cls)) {
        return true;
    }
    return false;
}
function countTags(html) {
    const out = {};
    let m;
    while ((m = TAG_RE.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        out[tag] = (out[tag] ?? 0) + 1;
    }
    return out;
}
function countClasses(html) {
    const out = {};
    let m;
    while ((m = CLASS_RE.exec(html)) !== null) {
        for (const tok of m[1].split(/\s+/)) {
            const cls = tok.trim().toLowerCase();
            if (!cls || isNoiseClass(cls))
                continue;
            out[cls] = (out[cls] ?? 0) + 1;
        }
    }
    return out;
}
const ATTR_CHECKS = [
    // Cart form action — Shopify
    { signature: "form[action=/cart/add]",
        test: (h) => /<form[^>]+action\s*=\s*["']\/cart\/add\b/i.test(h) },
    { signature: "form[action=/cart]",
        test: (h) => /<form[^>]+action\s*=\s*["']\/cart["']/i.test(h) },
    // Shopify product form marker
    { signature: "data-product-form",
        test: (h) => /\bdata-product-form\b/.test(h) },
    // Shopify cart line marker
    { signature: "data-cart-line",
        test: (h) => /\bdata-cart-line\b/.test(h) },
    // Shopify checkout global
    { signature: "window.Shopify.Checkout",
        test: (h) => /window\.Shopify\.Checkout\s*=/.test(h) },
    // WooCommerce form
    { signature: "single_add_to_cart_button",
        test: (h) => /\bsingle_add_to_cart_button\b/.test(h) },
    // WooCommerce products grid
    { signature: ".products",
        test: (h) => /<(?:ul|div)[^>]+class\s*=\s*["'][^"']*\bproducts\b/i.test(h) },
    // JSON-LD presence
    { signature: "script[type=application/ld+json]",
        test: (h) => /<script\b[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(h) },
];
function collectAttrSignatures(html) {
    return ATTR_CHECKS.filter((c) => c.test(html)).map((c) => c.signature);
}
const PDP_RULES = [
    // Add to cart
    { key: "addToCart", selector: "form[action='/cart/add'] button[name='add']",
        test: (h) => /<form[^>]+action\s*=\s*["']\/cart\/add[^"']*["'][^>]*>[\s\S]*?<button[^>]+name\s*=\s*["']add["']/i.test(h) },
    { key: "addToCart", selector: "button.product-form__submit",
        test: (h) => /\bproduct-form__submit\b/.test(h) },
    { key: "addToCart", selector: "button.single_add_to_cart_button",
        test: (h) => /\bsingle_add_to_cart_button\b/.test(h) },
    // Price
    { key: "price", selector: ".price-item--regular",
        test: (h) => /\bprice-item--regular\b/.test(h) },
    { key: "price", selector: ".woocommerce-Price-amount",
        test: (h) => /\bwoocommerce-Price-amount\b/.test(h) },
    { key: "price", selector: "[itemprop='price']",
        test: (h) => /\bitemprop\s*=\s*["']price["']/i.test(h) },
    // Title
    { key: "productTitle", selector: "h1.product__title",
        test: (h) => /<h1[^>]+class\s*=\s*["'][^"']*\bproduct__title\b/i.test(h) },
    { key: "productTitle", selector: "h1.product_title",
        test: (h) => /<h1[^>]+class\s*=\s*["'][^"']*\bproduct_title\b/i.test(h) },
    { key: "productTitle", selector: "[itemprop='name']",
        test: (h) => /\bitemprop\s*=\s*["']name["']/i.test(h) },
    // Image
    { key: "productImage", selector: ".product__media img",
        test: (h) => /<[^>]+class\s*=\s*["'][^"']*\bproduct__media\b/i.test(h) },
    { key: "productImage", selector: ".woocommerce-product-gallery img",
        test: (h) => /\bwoocommerce-product-gallery\b/.test(h) },
];
const CATEGORY_RULES = [
    { key: "productGrid", selector: "#product-grid",
        test: (h) => /\bid\s*=\s*["']product-grid["']/i.test(h) },
    { key: "productGrid", selector: "ul.products",
        test: (h) => /<ul[^>]+class\s*=\s*["'][^"']*\bproducts\b/i.test(h) },
    { key: "productCard", selector: ".grid__item",
        test: (h) => /\bgrid__item\b/.test(h) },
    { key: "productCard", selector: "li.product",
        test: (h) => /<li[^>]+class\s*=\s*["'][^"']*\bproduct\b[^"']*\btype-product\b/i.test(h) },
];
const CART_RULES = [
    { key: "cartLine", selector: "[data-cart-line]",
        test: (h) => /\bdata-cart-line\b/.test(h) },
    { key: "cartLine", selector: ".cart_item",
        test: (h) => /\bcart_item\b/.test(h) },
    { key: "cartSubtotal", selector: ".totals__subtotal-value",
        test: (h) => /\btotals__subtotal-value\b/.test(h) },
    { key: "cartSubtotal", selector: ".cart-subtotal",
        test: (h) => /\bcart-subtotal\b/.test(h) },
    { key: "checkoutButton", selector: "button[name='checkout']",
        test: (h) => /<button[^>]+name\s*=\s*["']checkout["']/i.test(h) },
    { key: "checkoutButton", selector: ".checkout-button",
        test: (h) => /\bcheckout-button\b/.test(h) },
];
const CHECKOUT_RULES = [
    { key: "loginForm", selector: "form[data-checkout-form]",
        test: (h) => /\bdata-checkout-form\b/.test(h) },
];
const ACCOUNT_RULES = [
    { key: "loginForm", selector: "form#customer_login",
        test: (h) => /\bid\s*=\s*["']customer_login["']/i.test(h) },
];
const SEARCH_RULES = [
    { key: "searchInput", selector: "input[name='q']",
        test: (h) => /<input[^>]+name\s*=\s*["']q["']/i.test(h) },
];
function rulesFor(pageType) {
    switch (pageType) {
        case "pdp": return PDP_RULES;
        case "category": return CATEGORY_RULES;
        case "cart": return CART_RULES;
        case "checkout": return CHECKOUT_RULES;
        case "account": return ACCOUNT_RULES;
        case "search_results": return SEARCH_RULES;
        default: return [];
    }
}
function inferSelectors(html, pageType) {
    const out = {};
    for (const rule of rulesFor(pageType)) {
        if (out[rule.key])
            continue; // first match wins
        if (rule.test(html))
            out[rule.key] = rule.selector;
    }
    return out;
}
//# sourceMappingURL=fingerprint.service.js.map