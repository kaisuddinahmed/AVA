import type { PageType } from "./page-classifier.service.js";
export interface FingerprintData {
    /** Total count of each HTML tag, lowercased. */
    tagCounts: Record<string, number>;
    /**
     * How often each distinct class token appears, lowercased. We capture
     * class names but discard one-off IDs, hash suffixes, and any class that
     * looks generated (matches /^[a-z0-9]{6,}$/-ish).
     */
    classFrequencies: Record<string, number>;
    /** Stable attribute signatures, e.g. "form[action=/cart/add]". */
    attrSignatures: string[];
    /** JSON-LD @types found on the page. */
    schemaTypes: string[];
}
export interface InferredSelectors {
    /** PDP — add-to-cart form or button. */
    addToCart?: string;
    /** PDP — price element. */
    price?: string;
    /** PDP — product title. */
    productTitle?: string;
    /** PDP — featured image. */
    productImage?: string;
    /** Category — product grid container. */
    productGrid?: string;
    /** Category — individual product card. */
    productCard?: string;
    /** Cart — single line item. */
    cartLine?: string;
    /** Cart — subtotal element. */
    cartSubtotal?: string;
    /** Cart — checkout button. */
    checkoutButton?: string;
    /** Account — login form. */
    loginForm?: string;
    /** Search — search input. */
    searchInput?: string;
}
export interface FingerprintResult {
    hash: string;
    data: FingerprintData;
    selectors: InferredSelectors;
}
/**
 * Compute a fingerprint for a single page. Pure: HTML + pageType in,
 * structured result out. Persistence is `persistFingerprint()` below.
 */
export declare function captureFingerprint(html: string, pageType: PageType): FingerprintResult;
/**
 * Persist a fingerprint capture. Wraps the repo so callers don't need to
 * stringify JSON or remember the column shape.
 */
export declare function persistFingerprint(siteUrl: string, pageType: PageType, capture: FingerprintResult): Promise<void>;
//# sourceMappingURL=fingerprint.service.d.ts.map