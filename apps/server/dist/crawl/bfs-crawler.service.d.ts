export interface CrawlPage {
    url: string;
    status: number;
    html: string;
    contentType: string | null;
    depth: number;
}
export interface CrawlResult {
    pages: CrawlPage[];
    /** URLs we didn't fetch because robots.txt disallowed them. */
    robotsBlocked: string[];
    /** URLs that errored mid-fetch (network/timeout). */
    errored: string[];
    /** Total URLs dequeued (including blocked + errored). */
    totalAttempted: number;
    /** Sitemap directives discovered in robots.txt. */
    sitemapsFromRobots: string[];
}
export interface CrawlOptions {
    rootUrl: string;
    /** Maximum link-following depth. Root is depth 0. Default 3. */
    maxDepth?: number;
    /** Hard cap on pages fetched. Default 50. */
    maxPages?: number;
    /** Default User-Agent: AVA-Onboarding/1.0. */
    userAgent?: string;
    /** Override fetch (tests). */
    fetchImpl?: typeof fetch;
    /** Pre-supplied robots.txt body — skips the initial fetch. */
    robotsTxt?: string;
    /** Skip robots checks entirely. Use ONLY for internal/test crawls. */
    ignoreRobots?: boolean;
    /** Per-request timeout in ms. Default 10s. */
    perRequestTimeoutMs?: number;
}
/**
 * Walk a site starting from `rootUrl`. Returns up to `maxPages` fetched
 * pages plus diagnostics. Same-origin only — links to other hosts are
 * silently skipped.
 */
export declare function crawlSite(opts: CrawlOptions): Promise<CrawlResult>;
//# sourceMappingURL=bfs-crawler.service.d.ts.map