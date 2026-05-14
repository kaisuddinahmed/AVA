/** A single entry inside a <urlset> sitemap. */
export interface SitemapUrl {
    loc: string;
    lastmod?: Date;
    changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    priority?: number;
}
/** A reference to a child sitemap inside a <sitemapindex>. */
export interface ChildSitemap {
    loc: string;
    lastmod?: Date;
}
export type SitemapResult = {
    kind: "urlset";
    urls: SitemapUrl[];
} | {
    kind: "sitemapindex";
    sitemaps: ChildSitemap[];
};
/**
 * Parse a sitemap XML document. Auto-detects between a regular `<urlset>` and
 * a `<sitemapindex>`. Returns `null` for unrecognized input rather than
 * throwing — callers usually have many candidate sitemap URLs and a single
 * malformed one shouldn't halt the crawl.
 */
export declare function parseSitemap(xml: string): SitemapResult | null;
//# sourceMappingURL=sitemap.parser.d.ts.map