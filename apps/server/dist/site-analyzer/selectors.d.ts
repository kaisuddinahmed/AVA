/**
 * Selectors — CSS selector patterns for detecting e-commerce elements.
 * Used by platform detectors and the hook generator.
 */
export interface SiteSelectors {
    addToCart: string[];
    cartCount: string[];
    cartTotal: string[];
    searchInput: string[];
    productTitle: string[];
    productPrice: string[];
    productImage: string[];
    checkoutButton: string[];
    reviewSection: string[];
    breadcrumb: string[];
}
/** Generic selectors that work across many e-commerce platforms. */
export declare const GENERIC_SELECTORS: SiteSelectors;
/** Page type detection patterns. */
export declare const PAGE_TYPE_PATTERNS: Record<string, RegExp[]>;
//# sourceMappingURL=selectors.d.ts.map