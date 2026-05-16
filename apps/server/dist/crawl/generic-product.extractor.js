// ============================================================================
// Generic product extractor — pulls a normalized product record out of a
// crawled PDP page using ONLY structured data (JSON-LD / microdata / OG).
//
// Phase 1.5.1. Strictly deterministic — no LLM calls. The LLM fallback for
// PDPs without structured data is Phase 1.5.2 and lives behind a feature
// flag + cost cap.
//
// Strategy: try the strongest signal first (JSON-LD Product → microdata
// Product → OpenGraph product). Return the first match. Anything we can't
// extract returns null and the caller skips the row (NOT hallucinate one).
//
// Zero deps. Composes structured-data.extractor.ts.
// ============================================================================
import { extractStructuredData, } from "./structured-data.extractor.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function urlHandleAndId(url) {
    let path;
    try {
        path = new URL(url).pathname.replace(/\/+$/, "");
    }
    catch {
        path = url;
    }
    const handle = (path.split("/").filter(Boolean).pop() || "product").toLowerCase();
    // externalId is generic:{host}{path} so two different sites with the
    // same /product/x slug never collide in SiteCatalog.
    let host = "";
    try {
        host = new URL(url).host;
    }
    catch { /* ignore */ }
    return { handle, externalId: `generic:${host}${path}` };
}
function toNumberLoose(raw) {
    if (raw == null)
        return null;
    if (typeof raw === "number")
        return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== "string")
        return null;
    // Strip currency symbols, thousands separators; allow comma-decimal too.
    const stripped = raw.replace(/[^\d.,-]/g, "");
    const normalized = stripped.includes(",") && !stripped.includes(".")
        ? stripped.replace(",", ".")
        : stripped.replace(/,/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}
function firstString(...candidates) {
    for (const c of candidates) {
        if (typeof c === "string" && c.trim())
            return c.trim();
    }
    return null;
}
function availabilityFromSchema(value) {
    if (typeof value !== "string")
        return "unknown";
    const v = value.toLowerCase();
    if (v.includes("instock") || v.includes("in_stock") || v.includes("limitedavailability"))
        return "in_stock";
    if (v.includes("outofstock") || v.includes("out_of_stock") || v.includes("soldout") || v.includes("discontinued"))
        return "out_of_stock";
    if (v.includes("preorder") || v.includes("backorder"))
        return "partial";
    return "unknown";
}
function jsonLdTypeIncludesProduct(node) {
    const t = node["@type"];
    if (typeof t === "string")
        return /product/i.test(t);
    if (Array.isArray(t))
        return t.some((x) => typeof x === "string" && /product/i.test(x));
    return false;
}
function firstImageUrl(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && value.length > 0) {
        const first = value[0];
        if (typeof first === "string")
            return first;
        if (first && typeof first === "object" && "url" in first) {
            const u = first.url;
            if (typeof u === "string")
                return u;
        }
    }
    if (value && typeof value === "object" && "url" in value) {
        const u = value.url;
        if (typeof u === "string")
            return u;
    }
    return null;
}
// ---------------------------------------------------------------------------
// JSON-LD path — strongest signal
// ---------------------------------------------------------------------------
function extractFromJsonLd(url, nodes) {
    const product = nodes.find(jsonLdTypeIncludesProduct);
    if (!product)
        return null;
    const title = firstString(product["name"]);
    if (!title)
        return null; // Refuse to invent a title.
    // Offers can be a single Offer, an array of Offers, or an AggregateOffer.
    const offers = product["offers"];
    let priceMin = null;
    let priceMax = null;
    let currency = "USD";
    let availability = "unknown";
    function ingestOffer(offer) {
        if (!offer || typeof offer !== "object")
            return;
        const o = offer;
        const t = typeof o["@type"] === "string" ? o["@type"] : "";
        if (/aggregateoffer/i.test(t)) {
            const lo = toNumberLoose(o["lowPrice"]);
            const hi = toNumberLoose(o["highPrice"]);
            if (lo !== null)
                priceMin = priceMin == null ? lo : Math.min(priceMin, lo);
            if (hi !== null)
                priceMax = priceMax == null ? hi : Math.max(priceMax, hi);
        }
        else {
            const p = toNumberLoose(o["price"]);
            if (p !== null) {
                priceMin = priceMin == null ? p : Math.min(priceMin, p);
                priceMax = priceMax == null ? p : Math.max(priceMax, p);
            }
        }
        const c = firstString(o["priceCurrency"]);
        if (c)
            currency = c;
        const a = availabilityFromSchema(o["availability"]);
        if (a !== "unknown")
            availability = a;
    }
    if (Array.isArray(offers))
        offers.forEach(ingestOffer);
    else
        ingestOffer(offers);
    const { handle, externalId } = urlHandleAndId(url);
    return {
        externalId,
        handle,
        title,
        description: firstString(product["description"]),
        imageUrl: firstImageUrl(product["image"]),
        priceMin,
        priceMax,
        currency,
        availability,
    };
}
// ---------------------------------------------------------------------------
// Microdata path
// ---------------------------------------------------------------------------
function firstProp(item, key) {
    const v = item.properties[key];
    if (typeof v === "string")
        return v;
    if (Array.isArray(v)) {
        const s = v.find((x) => typeof x === "string");
        return typeof s === "string" ? s : null;
    }
    return null;
}
function nestedItem(item, key) {
    const v = item.properties[key];
    if (v && typeof v === "object" && !Array.isArray(v) && "@type" in v) {
        return v;
    }
    if (Array.isArray(v)) {
        const first = v.find((x) => x && typeof x === "object" && "@type" in x);
        return first ?? null;
    }
    return null;
}
function extractFromMicrodata(url, items) {
    const product = items.find((i) => /product/i.test(i["@type"]));
    if (!product)
        return null;
    const title = firstProp(product, "name");
    if (!title)
        return null;
    const offer = nestedItem(product, "offers");
    const priceFromOffer = offer ? toNumberLoose(firstProp(offer, "price") ?? "") : null;
    const currency = (offer && firstProp(offer, "priceCurrency")) || "USD";
    const availability = offer ? availabilityFromSchema(firstProp(offer, "availability")) : "unknown";
    const { handle, externalId } = urlHandleAndId(url);
    return {
        externalId,
        handle,
        title,
        description: firstProp(product, "description"),
        imageUrl: firstProp(product, "image"),
        priceMin: priceFromOffer,
        priceMax: priceFromOffer,
        currency,
        availability,
    };
}
// ---------------------------------------------------------------------------
// OpenGraph path — weakest, only used when JSON-LD + microdata absent
// ---------------------------------------------------------------------------
/**
 * Pick a single `<meta property="..." content="...">` out of raw HTML.
 * `extractOpenGraph` from structured-data.extractor.ts only picks `og:*` —
 * the `product:*` namespace is OG's product schema and we need to read it
 * for price/currency/availability.
 */
function metaContent(html, property) {
    const re = new RegExp(`<meta\\b[^>]*\\bproperty\\s*=\\s*["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    if (!tag)
        return null;
    const c = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    return c ? c[1] : null;
}
function extractFromOpenGraph(url, og, html) {
    // Must have og:type=product to qualify; otherwise OG might be about an
    // article/blog post and we don't want to invent a product row.
    const type = og["type"] ?? "";
    if (!/product/i.test(type))
        return null;
    const title = og["title"];
    if (!title)
        return null;
    // product:* meta tags live OUTSIDE the og:* namespace — scan raw HTML.
    const priceAmt = toNumberLoose(metaContent(html, "product:price:amount"));
    const currency = metaContent(html, "product:price:currency") ?? "USD";
    const availability = availabilityFromSchema(metaContent(html, "product:availability"));
    const { handle, externalId } = urlHandleAndId(url);
    return {
        externalId,
        handle,
        title,
        description: og["description"] ?? null,
        imageUrl: og["image"] ?? null,
        priceMin: priceAmt,
        priceMax: priceAmt,
        currency,
        availability,
    };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Extract a single product record from a crawled HTML page using structured
 * data only. Returns `null` if no Product node is present — callers must NOT
 * fall back to hallucinated rows.
 *
 * The signal-source tag in the result lets analytics measure structured-data
 * coverage across a site (Phase 1.5.1 wizard preview surfaces this).
 */
export function extractGenericProduct(url, html) {
    const sd = extractStructuredData(html);
    const fromJsonLd = extractFromJsonLd(url, sd.jsonLd);
    if (fromJsonLd)
        return { ...fromJsonLd, url, sourceSignal: "jsonld" };
    const fromMicrodata = extractFromMicrodata(url, sd.microdata);
    if (fromMicrodata)
        return { ...fromMicrodata, url, sourceSignal: "microdata" };
    const fromOg = extractFromOpenGraph(url, sd.openGraph, html);
    if (fromOg)
        return { ...fromOg, url, sourceSignal: "opengraph" };
    return null;
}
//# sourceMappingURL=generic-product.extractor.js.map