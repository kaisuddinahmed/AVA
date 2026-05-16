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

import {
  extractStructuredData,
  type JsonLdNode,
  type MicrodataItem,
} from "./structured-data.extractor.js";

// ---------------------------------------------------------------------------
// Public type — what the orchestrator (Phase 1.5.1 ingest) consumes
// ---------------------------------------------------------------------------

export interface GenericProduct {
  /** A stable id for SiteCatalog. URL-derived so re-crawls of the same page
   *  upsert the same row instead of inserting duplicates. */
  externalId: string;
  /** URL slug — last path segment, normalized. */
  handle: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  availability: "in_stock" | "out_of_stock" | "partial" | "unknown";
  url: string;
  /** Which signal layer produced this record (telemetry).
   *  - jsonld / microdata / opengraph: deterministic structured-data paths (1.5.1)
   *  - llm: Phase 1.5.2 LLM DOM mapper fallback (only when structured data is absent) */
  sourceSignal: "jsonld" | "microdata" | "opengraph" | "llm";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlHandleAndId(url: string): { handle: string; externalId: string } {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    path = url;
  }
  const handle = (path.split("/").filter(Boolean).pop() || "product").toLowerCase();
  // externalId is generic:{host}{path} so two different sites with the
  // same /product/x slug never collide in SiteCatalog.
  let host = "";
  try { host = new URL(url).host; } catch { /* ignore */ }
  return { handle, externalId: `generic:${host}${path}` };
}

function toNumberLoose(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  // Strip currency symbols, thousands separators; allow comma-decimal too.
  const stripped = raw.replace(/[^\d.,-]/g, "");
  const normalized = stripped.includes(",") && !stripped.includes(".")
    ? stripped.replace(",", ".")
    : stripped.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function availabilityFromSchema(value: unknown): GenericProduct["availability"] {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase();
  if (v.includes("instock") || v.includes("in_stock") || v.includes("limitedavailability")) return "in_stock";
  if (v.includes("outofstock") || v.includes("out_of_stock") || v.includes("soldout") || v.includes("discontinued")) return "out_of_stock";
  if (v.includes("preorder") || v.includes("backorder")) return "partial";
  return "unknown";
}

function jsonLdTypeIncludesProduct(node: JsonLdNode): boolean {
  const t = node["@type"];
  if (typeof t === "string") return /product/i.test(t);
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && /product/i.test(x));
  return false;
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in (first as object)) {
      const u = (first as { url: unknown }).url;
      if (typeof u === "string") return u;
    }
  }
  if (value && typeof value === "object" && "url" in (value as object)) {
    const u = (value as { url: unknown }).url;
    if (typeof u === "string") return u;
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSON-LD path — strongest signal
// ---------------------------------------------------------------------------

function extractFromJsonLd(url: string, nodes: JsonLdNode[]): Omit<GenericProduct, "url" | "sourceSignal"> | null {
  const product = nodes.find(jsonLdTypeIncludesProduct);
  if (!product) return null;

  const title = firstString(product["name"]);
  if (!title) return null; // Refuse to invent a title.

  // Offers can be a single Offer, an array of Offers, or an AggregateOffer.
  const offers = product["offers"];
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  let currency = "USD";
  let availability: GenericProduct["availability"] = "unknown";

  function ingestOffer(offer: unknown) {
    if (!offer || typeof offer !== "object") return;
    const o = offer as Record<string, unknown>;
    const t = typeof o["@type"] === "string" ? (o["@type"] as string) : "";
    if (/aggregateoffer/i.test(t)) {
      const lo = toNumberLoose(o["lowPrice"]);
      const hi = toNumberLoose(o["highPrice"]);
      if (lo !== null) priceMin = priceMin == null ? lo : Math.min(priceMin, lo);
      if (hi !== null) priceMax = priceMax == null ? hi : Math.max(priceMax, hi);
    } else {
      const p = toNumberLoose(o["price"]);
      if (p !== null) {
        priceMin = priceMin == null ? p : Math.min(priceMin, p);
        priceMax = priceMax == null ? p : Math.max(priceMax, p);
      }
    }
    const c = firstString(o["priceCurrency"]);
    if (c) currency = c;
    const a = availabilityFromSchema(o["availability"]);
    if (a !== "unknown") availability = a;
  }

  if (Array.isArray(offers)) offers.forEach(ingestOffer);
  else ingestOffer(offers);

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

function firstProp(item: MicrodataItem, key: string): string | null {
  const v = item.properties[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : null;
  }
  return null;
}

function nestedItem(item: MicrodataItem, key: string): MicrodataItem | null {
  const v = item.properties[key];
  if (v && typeof v === "object" && !Array.isArray(v) && "@type" in v) {
    return v as MicrodataItem;
  }
  if (Array.isArray(v)) {
    const first = v.find((x) => x && typeof x === "object" && "@type" in (x as object));
    return (first as MicrodataItem) ?? null;
  }
  return null;
}

function extractFromMicrodata(url: string, items: MicrodataItem[]): Omit<GenericProduct, "url" | "sourceSignal"> | null {
  const product = items.find((i) => /product/i.test(i["@type"]));
  if (!product) return null;
  const title = firstProp(product, "name");
  if (!title) return null;

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
function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta\\b[^>]*\\bproperty\\s*=\\s*["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const c = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
  return c ? c[1] : null;
}

function extractFromOpenGraph(
  url: string,
  og: Record<string, string>,
  html: string,
): Omit<GenericProduct, "url" | "sourceSignal"> | null {
  // Must have og:type=product to qualify; otherwise OG might be about an
  // article/blog post and we don't want to invent a product row.
  const type = og["type"] ?? "";
  if (!/product/i.test(type)) return null;

  const title = og["title"];
  if (!title) return null;

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
export function extractGenericProduct(url: string, html: string): GenericProduct | null {
  const sd = extractStructuredData(html);

  const fromJsonLd = extractFromJsonLd(url, sd.jsonLd);
  if (fromJsonLd) return { ...fromJsonLd, url, sourceSignal: "jsonld" };

  const fromMicrodata = extractFromMicrodata(url, sd.microdata);
  if (fromMicrodata) return { ...fromMicrodata, url, sourceSignal: "microdata" };

  const fromOg = extractFromOpenGraph(url, sd.openGraph, html);
  if (fromOg) return { ...fromOg, url, sourceSignal: "opengraph" };

  return null;
}
