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
/**
 * Extract a single product record from a crawled HTML page using structured
 * data only. Returns `null` if no Product node is present — callers must NOT
 * fall back to hallucinated rows.
 *
 * The signal-source tag in the result lets analytics measure structured-data
 * coverage across a site (Phase 1.5.1 wizard preview surfaces this).
 */
export declare function extractGenericProduct(url: string, html: string): GenericProduct | null;
//# sourceMappingURL=generic-product.extractor.d.ts.map