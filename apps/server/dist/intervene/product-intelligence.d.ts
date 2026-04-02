/**
 * Product Intelligence — derives product suggestions from session browsing history.
 *
 * No vector DB required: product context is extracted from rawSignals on
 * product_detail_view events that the widget already captures.
 *
 * Widget field reference (collector.ts):
 *   product_detail_view  → product_name, product_price (string "$29.99"), product_category
 *   add_to_cart_click    → button_text, page_url only (no product context)
 *   product_card clicks  → product_id, product_name, product_price, product_category
 */
export interface ProductSuggestion {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
    url: string;
    reason: string;
}
export interface ProductComparison {
    count: number;
    priceRange: {
        min: number;
        max: number;
    };
    categories: string[];
}
interface BrowsedProduct {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
    url: string;
    category: string;
    viewCount: number;
    inCart: boolean;
}
interface SessionEvent {
    eventType?: string;
    type?: string;
    frictionId?: string | null;
    signals?: Record<string, unknown>;
}
/**
 * Extract browsed products from session event history.
 * Only product_detail_view events carry full product context from the widget.
 * add_to_cart_click events carry only a button label — not usable for product data.
 *
 * Deduplicates by product_name (used as stable key when product_id is absent)
 * and accumulates view count to rank by user interest.
 */
export declare function extractProductsFromEvents(events: SessionEvent[]): BrowsedProduct[];
/**
 * Find alternative products for a given friction context.
 *
 * Strategy by friction type:
 * - Out-of-stock (F053, F054): alternatives from same category, not in cart
 * - Price/value friction (F100-F115): cheapest products from browsing history
 * - Checkout/payment failure (F096, F097, F112): highest-intent product (most views)
 * - Default: last 2 browsed products as "recently viewed"
 */
export declare function findAlternatives(frictionId: string, context: {
    events: SessionEvent[];
    cartValue: number;
    frictionIds: string[];
}): ProductSuggestion[];
/**
 * Find complementary products for upselling.
 * Returns other browsed products not yet in cart, from different categories.
 */
export declare function findComplementary(productId: string, context: {
    events: SessionEvent[];
}): ProductSuggestion[];
/**
 * Build a comparison summary for the panel's comparison field.
 * Uses real product categories from the suggestions.
 */
export declare function buildComparison(products: ProductSuggestion[], browsed?: BrowsedProduct[]): ProductComparison | null;
export {};
//# sourceMappingURL=product-intelligence.d.ts.map