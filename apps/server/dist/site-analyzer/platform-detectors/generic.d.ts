import { type SiteSelectors } from "../selectors.js";
/**
 * Generic Platform Detector — Fallback for custom or unrecognized e-commerce platforms.
 * Uses heuristic-based detection with common CSS patterns.
 */
export declare function isGeneric(_html: string): boolean;
export declare const GENERIC_PLATFORM_SELECTORS: SiteSelectors;
/**
 * Enhanced generic detection — scans DOM for common e-commerce patterns.
 */
export interface GenericDetectionResult {
    hasProducts: boolean;
    hasCart: boolean;
    hasSearch: boolean;
    hasCheckout: boolean;
    confidence: number;
}
export declare function detectGenericEcommerce(html: string): GenericDetectionResult;
//# sourceMappingURL=generic.d.ts.map