import { type TrackingHooks } from "./hook-generator.js";
/**
 * Site Analyzer Service — Detects e-commerce platform and generates tracking hooks.
 * Results are cached in the SiteConfig database table.
 */
export interface AnalysisResult {
    siteUrl: string;
    platform: string;
    trackingHooks: TrackingHooks;
    cached: boolean;
}
/**
 * Analyze a site URL to determine platform and generate tracking configuration.
 * Checks DB cache first, then detects platform from provided HTML.
 */
export declare function analyzeSite(siteUrl: string, html?: string): Promise<AnalysisResult>;
/**
 * Get tracking hooks for a site (from cache or defaults).
 */
export declare function getTrackingHooks(siteUrl: string): Promise<TrackingHooks>;
/**
 * Force re-analysis of a site (clears cache).
 */
export declare function reanalyzeSite(siteUrl: string, html: string): Promise<AnalysisResult>;
//# sourceMappingURL=analyzer.service.d.ts.map