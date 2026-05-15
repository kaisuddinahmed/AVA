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
export declare function extractStructuredData(html: string): StructuredData;
/**
 * Parse every `<script type="application/ld+json">` block and flatten any
 * `@graph` wrappers. Malformed blocks are skipped silently.
 */
export declare function extractJsonLd(html: string): JsonLdNode[];
/**
 * Return all @type strings present in `nodes` — handy when the classifier
 * just needs to know which schema.org types appear without caring about
 * payload details.
 */
export declare function jsonLdTypes(nodes: JsonLdNode[]): string[];
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
export declare function extractMicrodata(html: string): MicrodataItem[];
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
export declare function extractOpenGraph(html: string): Record<string, string>;
//# sourceMappingURL=structured-data.extractor.d.ts.map