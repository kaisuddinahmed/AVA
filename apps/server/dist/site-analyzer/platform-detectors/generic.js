import { GENERIC_SELECTORS } from "../selectors.js";
/**
 * Generic Platform Detector — Fallback for custom or unrecognized e-commerce platforms.
 * Uses heuristic-based detection with common CSS patterns.
 */
export function isGeneric(_html) {
    // Always returns true as the final fallback
    return true;
}
export const GENERIC_PLATFORM_SELECTORS = GENERIC_SELECTORS;
export function detectGenericEcommerce(html) {
    const hasProducts = html.includes("product") ||
        html.includes("item-price") ||
        html.includes("add-to-cart") ||
        html.includes("price");
    const hasCart = html.includes("cart") ||
        html.includes("basket") ||
        html.includes("bag-count");
    const hasSearch = html.includes("search") ||
        html.includes('type="search"') ||
        html.includes('name="q"');
    const hasCheckout = html.includes("checkout") ||
        html.includes("payment") ||
        html.includes("order-summary");
    let confidence = 0;
    if (hasProducts)
        confidence += 30;
    if (hasCart)
        confidence += 25;
    if (hasSearch)
        confidence += 20;
    if (hasCheckout)
        confidence += 25;
    return { hasProducts, hasCart, hasSearch, hasCheckout, confidence };
}
//# sourceMappingURL=generic.js.map