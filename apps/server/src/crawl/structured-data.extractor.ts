// ============================================================================
// Structured-data extractor — JSON-LD (incl. @graph), microdata, OpenGraph.
//
// Phase 1.2.3. Zero-dep, regex-only HTML scanning.
//
// Closes the @graph gap Codex flagged (task #39): many real ecommerce sites
// wrap their structured data in `{ "@context": ..., "@graph": [...] }`. We
// flatten that envelope so callers see Product/ItemList nodes at the top
// level uniformly.
//
// Scope guard: this is for ONBOARDING signal extraction, not a general
// schema.org parser. We extract the @type and field shape needed to
// classify pages and surface catalog data; we do not validate against the
// full schema.org spec.
// ============================================================================

export interface StructuredData {
  /** Each JSON-LD node — flat (any @graph wrappers unwrapped). */
  jsonLd: JsonLdNode[];
  /** Microdata items extracted from itemscope/itemtype elements. */
  microdata: MicrodataItem[];
  /** OpenGraph properties keyed by suffix (e.g. "type", "title", "image"). */
  openGraph: Record<string, string>;
}

export interface JsonLdNode {
  "@type": string | string[];
  [key: string]: unknown;
}

export interface MicrodataItem {
  "@type": string;
  properties: Record<string, string | MicrodataItem | Array<string | MicrodataItem>>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractStructuredData(html: string): StructuredData {
  if (!html || typeof html !== "string") {
    return { jsonLd: [], microdata: [], openGraph: {} };
  }
  return {
    jsonLd: extractJsonLd(html),
    microdata: extractMicrodata(html),
    openGraph: extractOpenGraph(html),
  };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/**
 * Parse every `<script type="application/ld+json">` block and flatten any
 * `@graph` wrappers. Malformed blocks are skipped silently.
 */
export function extractJsonLd(html: string): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim();
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    flattenJsonLd(parsed, out);
  }
  return out;
}

/**
 * Recursively flatten a JSON-LD value into a flat array of typed nodes.
 *
 * Cases handled:
 *   - Top-level array     → recurse into each entry
 *   - { @graph: [...] }   → recurse into the graph array (drop wrapper)
 *   - { @type: T, ... }   → push as-is
 *   - Anything else       → drop
 */
function flattenJsonLd(value: unknown, out: JsonLdNode[]): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) flattenJsonLd(entry, out);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    flattenJsonLd(obj["@graph"], out);
    return;
  }
  if (typeof obj["@type"] === "string" || Array.isArray(obj["@type"])) {
    out.push(obj as JsonLdNode);
  }
}

/**
 * Return all @type strings present in `nodes` — handy when the classifier
 * just needs to know which schema.org types appear without caring about
 * payload details.
 */
export function jsonLdTypes(nodes: JsonLdNode[]): string[] {
  const types: string[] = [];
  for (const n of nodes) {
    const t = n["@type"];
    if (typeof t === "string") types.push(t);
    else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") types.push(v);
  }
  return types;
}

// ---------------------------------------------------------------------------
// Microdata
// ---------------------------------------------------------------------------

/**
 * Extract microdata items (itemscope/itemtype/itemprop). Regex-based with
 * a stack walk over open/close tags — handles nested itemscope blocks.
 *
 * Coverage:
 *   - itemtype → @type (last segment of the URL, e.g. schema.org/Product → Product)
 *   - itemprop → property name
 *   - String value from inner text OR specific attrs (content, href, src)
 *   - Nested itemscope → nested MicrodataItem
 *
 * Out of scope (rare in practice): itemref, itemid.
 */
export function extractMicrodata(html: string): MicrodataItem[] {
  const items: MicrodataItem[] = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/g;

  // Stack frame for each open tag — used to attribute properties + nested scopes.
  interface Frame {
    tag: string;
    attrs: Record<string, string>;
    item?: MicrodataItem;       // present when itemscope opened here
    itemprop?: string;          // property name to attribute on close
    parent?: MicrodataItem;     // ancestor item to receive this prop
    textStart: number;          // for inner-text capture
  }
  const stack: Frame[] = [];

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1]) {
      // Open or self-closing tag
      const tag = m[1].toLowerCase();
      const attrs = parseAttrs(m[2]);
      const isSelfClosing = m[2].trim().endsWith("/") || VOID_TAGS.has(tag);

      const frame: Frame = { tag, attrs, textStart: m.index + m[0].length };
      // Start a new item?
      if ("itemscope" in attrs || attrs["itemscope"] === "") {
        const type = typeFromItemtype(attrs["itemtype"]);
        frame.item = { "@type": type, properties: {} };
      }
      // Attach to a parent item via itemprop
      const parentItem = nearestItem(stack);
      if (attrs["itemprop"] && parentItem) {
        frame.itemprop = attrs["itemprop"];
        frame.parent = parentItem;

        // Self-closing or attribute-derived values: capture now
        if (!frame.item && isSelfClosing) {
          const v = valueFromAttrs(tag, attrs);
          if (v != null) setProperty(parentItem, frame.itemprop, v);
        }
      }

      if (!isSelfClosing) stack.push(frame);
      else if (frame.item) {
        // Self-closing root itemscope (rare) — emit immediately
        if (!parentItem) items.push(frame.item);
        else if (frame.itemprop) setProperty(parentItem, frame.itemprop, frame.item);
      }
      continue;
    }
    // Closing tag
    const closeTag = (m[3] || "").toLowerCase();
    // Pop the matching frame
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag !== closeTag) continue;
      const frame = stack[i];
      const closedRange = [frame.textStart, m.index] as const;
      stack.splice(i, 1);

      if (frame.item) {
        // Emit item
        const owner = nearestItem(stack);
        if (frame.itemprop && frame.parent) {
          setProperty(frame.parent, frame.itemprop, frame.item);
        } else if (!owner) {
          items.push(frame.item);
        }
      } else if (frame.itemprop && frame.parent) {
        // String property — use attribute value or inner text
        const attrVal = valueFromAttrs(frame.tag, frame.attrs);
        const text = attrVal != null
          ? attrVal
          : stripTags(html.slice(closedRange[0], closedRange[1])).trim();
        if (text) setProperty(frame.parent, frame.itemprop, text);
      }
      break;
    }
  }

  return items;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\b([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    out[key] = val;
  }
  return out;
}

function typeFromItemtype(itemtype: string | undefined): string {
  if (!itemtype) return "Thing";
  // Strip trailing slash, take last URL segment
  const trimmed = itemtype.trim().replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

function valueFromAttrs(tag: string, attrs: Record<string, string>): string | null {
  // meta uses content, anchors/img/links use their resource attribute.
  if (tag === "meta" && attrs["content"] != null) return attrs["content"];
  if ((tag === "a" || tag === "link") && attrs["href"] != null) return attrs["href"];
  if (tag === "img" && attrs["src"] != null) return attrs["src"];
  if ((tag === "time" || tag === "data") && attrs["datetime"] != null) return attrs["datetime"];
  if (tag === "data" && attrs["value"] != null) return attrs["value"];
  return null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

function nearestItem(stack: Array<{ item?: MicrodataItem }>): MicrodataItem | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].item) return stack[i].item;
  }
  return undefined;
}

function setProperty(
  item: MicrodataItem,
  key: string,
  value: string | MicrodataItem,
): void {
  const existing = item.properties[key];
  if (existing == null) {
    item.properties[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  item.properties[key] = [existing, value];
}

// ---------------------------------------------------------------------------
// OpenGraph
// ---------------------------------------------------------------------------

/**
 * Extract OpenGraph meta tags as a flat record keyed by the suffix after
 * "og:". For repeated keys (e.g. multiple og:image), the LAST value in
 * document order wins — matches how Facebook / Twitter Card / Slack
 * interpret OG.
 *
 * Single-pass over `<meta>` tags so attribute ordering inside the tag
 * (property-before-content vs content-before-property) doesn't break the
 * last-wins semantic.
 */
export function extractOpenGraph(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    const propMatch = tag.match(/\bproperty\s*=\s*["']og:([^"']+)["']/i);
    if (!propMatch) continue;
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (!contentMatch) continue;
    // Natural overwrite — later occurrence in document order wins.
    out[propMatch[1].toLowerCase()] = contentMatch[1];
  }
  return out;
}
