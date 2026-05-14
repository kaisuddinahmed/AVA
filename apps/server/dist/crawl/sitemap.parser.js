// ============================================================================
// Sitemap parser — handles sitemap.xml (urlset) and sitemap_index.xml.
//
// Zero external deps. Sitemap XML is narrowly specified by sitemaps.org so
// regex-driven extraction is robust enough; we trade flexibility for not
// pulling a parser into the server bundle.
//
// Used by:
//   - crawler / page-map walker (Phase 1.0, 1.2)
//   - Shopify vertical-slice ingestion (Phase 1.1)
//
// SCOPE GUARD (Codex 2026-05-14): DO NOT generalize this into a generic XML
// parser. The reason it's regex-only is that the sitemap schema is fixed.
// Any other XML need (RSS feeds, atom, generic feeds) gets its own dedicated
// parser or a real XML library — never extend this file.
// ============================================================================
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const XML_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
};
function decodeXmlEntities(s) {
    return s
        .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
/** Extract the first text inside a child element of `block`, e.g. <loc>...</loc>. */
function extractTag(block, tag) {
    // Tolerate optional namespace prefix on tag, e.g. <ns:loc>
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "i");
    const m = block.match(re);
    if (!m)
        return undefined;
    return decodeXmlEntities(m[1].trim());
}
/** Iterate every top-level block element with the given tag name in `xml`. */
function iterBlocks(xml, tag) {
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w-]+:)?${tag}>`, "gi");
    return xml.match(re) ?? [];
}
function parseLastmod(raw) {
    if (!raw)
        return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
function parsePriority(raw) {
    if (!raw)
        return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n))
        return undefined;
    if (n < 0 || n > 1)
        return undefined;
    return n;
}
function parseChangefreq(raw) {
    if (!raw)
        return undefined;
    const lc = raw.toLowerCase();
    switch (lc) {
        case "always":
        case "hourly":
        case "daily":
        case "weekly":
        case "monthly":
        case "yearly":
        case "never":
            return lc;
        default:
            return undefined;
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse a sitemap XML document. Auto-detects between a regular `<urlset>` and
 * a `<sitemapindex>`. Returns `null` for unrecognized input rather than
 * throwing — callers usually have many candidate sitemap URLs and a single
 * malformed one shouldn't halt the crawl.
 */
export function parseSitemap(xml) {
    if (!xml || typeof xml !== "string")
        return null;
    // Strip BOM and leading whitespace so root detection is robust.
    const trimmed = xml.replace(/^﻿/, "").trimStart();
    if (!trimmed.startsWith("<"))
        return null;
    if (/<(?:[\w-]+:)?sitemapindex\b/i.test(trimmed)) {
        return { kind: "sitemapindex", sitemaps: parseIndex(trimmed) };
    }
    if (/<(?:[\w-]+:)?urlset\b/i.test(trimmed)) {
        return { kind: "urlset", urls: parseUrlset(trimmed) };
    }
    return null;
}
function parseUrlset(xml) {
    const urls = [];
    for (const block of iterBlocks(xml, "url")) {
        const loc = extractTag(block, "loc");
        if (!loc)
            continue;
        urls.push({
            loc,
            lastmod: parseLastmod(extractTag(block, "lastmod")),
            changefreq: parseChangefreq(extractTag(block, "changefreq")),
            priority: parsePriority(extractTag(block, "priority")),
        });
    }
    return urls;
}
function parseIndex(xml) {
    const sitemaps = [];
    for (const block of iterBlocks(xml, "sitemap")) {
        const loc = extractTag(block, "loc");
        if (!loc)
            continue;
        sitemaps.push({
            loc,
            lastmod: parseLastmod(extractTag(block, "lastmod")),
        });
    }
    return sitemaps;
}
//# sourceMappingURL=sitemap.parser.js.map