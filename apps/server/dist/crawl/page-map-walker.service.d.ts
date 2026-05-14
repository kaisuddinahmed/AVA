import { type PageType } from "./page-classifier.service.js";
export interface WalkInput {
    /** Canonical site URL (used as the SiteMap key). */
    siteUrl: string;
    /** Sitemap URL. Defaults to `${siteUrl}/sitemap.xml`. */
    sitemapUrl?: string;
    /** Inject a fetch impl (used by tests). */
    fetchImpl?: typeof fetch;
    /** Safety cap on total URLs walked. Default 5000. */
    maxUrls?: number;
}
export interface PageTypeMapping {
    count: number;
    /** 0..1 — confidence that this pageType detection generalizes across the site. */
    confidence: number;
    /** Canonical URL pattern (e.g. "/products/:handle"). */
    urlPattern: string;
    /** Up to 5 sample URLs of this type, for the wizard preview card. */
    samples: string[];
}
export interface PageMapResult {
    siteUrl: string;
    totalUrls: number;
    classifiedUrls: number;
    byPageType: Partial<Record<PageType, PageTypeMapping>>;
    /** Pages walked across the sitemap index hierarchy. */
    sitemapsFetched: number;
}
/**
 * Walk a site's sitemap, classify every URL, and persist one SiteMap row per
 * pageType. Returns aggregate stats + per-type mapping confidence for the
 * wizard preview.
 *
 * Pages classified as "other" are counted but not persisted — they don't
 * contribute to widget routing decisions.
 *
 * Failure modes:
 *   - Sitemap unreachable → returns empty result with sitemapsFetched=0
 *   - Malformed sitemap   → returns empty result
 *   - Per-pageType DB upsert failure → logged + skipped, others still persist
 */
export declare function walkPageMap(input: WalkInput): Promise<PageMapResult>;
//# sourceMappingURL=page-map-walker.service.d.ts.map