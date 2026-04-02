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
/**
 * Extract browsed products from session event history.
 * Only product_detail_view events carry full product context from the widget.
 * add_to_cart_click events carry only a button label — not usable for product data.
 *
 * Deduplicates by product_name (used as stable key when product_id is absent)
 * and accumulates view count to rank by user interest.
 */
export function extractProductsFromEvents(events) {
    const productMap = new Map();
    for (const event of events) {
        const eventType = (event.eventType ?? event.type ?? "");
        // Only product_detail_view carries full product context
        if (eventType !== "product_detail_view")
            continue;
        const signals = (event.signals ?? {});
        // Use product_id when present, fall back to product_name as dedup key
        const productKey = signals.product_id ?? signals.product_name ?? null;
        if (!productKey)
            continue;
        const name = signals.product_name ?? productKey;
        // product_price is a string like "$29.99" or "N/A" — strip non-numeric chars
        const priceRaw = signals.product_price ?? "";
        const price = parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || 0;
        const imageUrl = signals.image_url ?? "";
        const url = signals.product_url ?? signals.url ?? "";
        // Widget field is product_category (not "category")
        const category = signals.product_category && signals.product_category !== "unknown"
            ? signals.product_category
            : "general";
        const existing = productMap.get(productKey);
        if (existing) {
            existing.viewCount += 1;
            // Enrich fields if later event has better data
            if (!existing.imageUrl && imageUrl)
                existing.imageUrl = imageUrl;
            if (!existing.url && url)
                existing.url = url;
            if (existing.category === "general" && category !== "general")
                existing.category = category;
        }
        else {
            productMap.set(productKey, {
                id: productKey,
                name,
                price,
                imageUrl,
                url,
                category,
                viewCount: 1,
                inCart: false, // add_to_cart_click has no product_id to correlate here
            });
        }
    }
    // Sort by view count descending (highest interest first)
    return Array.from(productMap.values()).sort((a, b) => b.viewCount - a.viewCount);
}
/**
 * Find alternative products for a given friction context.
 *
 * Strategy by friction type:
 * - Out-of-stock (F053, F054): alternatives from same category, not in cart
 * - Price/value friction (F100-F115): cheapest products from browsing history
 * - Checkout/payment failure (F096, F097, F112): highest-intent product (most views)
 * - Default: last 2 browsed products as "recently viewed"
 */
export function findAlternatives(frictionId, context) {
    const browsed = extractProductsFromEvents(context.events);
    if (browsed.length === 0)
        return [];
    const notInCart = browsed.filter((p) => !p.inCart);
    // Out-of-stock: suggest same-category alternatives not in cart
    if (frictionId === "F053" || frictionId === "F054") {
        const inCartCategories = new Set(browsed.filter((p) => p.inCart).map((p) => p.category));
        const sameCategory = notInCart
            .filter((p) => inCartCategories.has(p.category))
            .slice(0, 3);
        if (sameCategory.length > 0) {
            return sameCategory.map((p) => ({
                ...toSuggestion(p),
                reason: "Similar product available",
            }));
        }
    }
    // Price friction: surface cheapest options
    const isPriceFriction = frictionId >= "F100" && frictionId <= "F115";
    if (isPriceFriction) {
        const cheapest = [...notInCart]
            .filter((p) => p.price > 0)
            .sort((a, b) => a.price - b.price)
            .slice(0, 3);
        if (cheapest.length > 0) {
            return cheapest.map((p) => ({
                ...toSuggestion(p),
                reason: "Lower price option",
            }));
        }
    }
    // Checkout / payment failure: re-surface highest-intent product
    const isCheckoutFriction = frictionId === "F096" ||
        frictionId === "F097" ||
        frictionId === "F112";
    if (isCheckoutFriction && browsed.length > 0) {
        return [
            {
                ...toSuggestion(browsed[0]),
                reason: "Your most viewed item",
            },
        ];
    }
    // Default: up to 2 recently browsed products not in cart
    return notInCart.slice(0, 2).map((p) => ({
        ...toSuggestion(p),
        reason: "Recently viewed",
    }));
}
/**
 * Find complementary products for upselling.
 * Returns other browsed products not yet in cart, from different categories.
 */
export function findComplementary(productId, context) {
    const browsed = extractProductsFromEvents(context.events);
    const anchor = browsed.find((p) => p.id === productId);
    const candidates = browsed.filter((p) => p.id !== productId && !p.inCart);
    // Prefer products from different categories (cross-sell)
    const crossCategory = anchor
        ? candidates.filter((p) => p.category !== anchor.category)
        : candidates;
    const pool = crossCategory.length > 0 ? crossCategory : candidates;
    return pool.slice(0, 2).map((p) => ({
        ...toSuggestion(p),
        reason: "Goes well with your selection",
    }));
}
/**
 * Build a comparison summary for the panel's comparison field.
 * Uses real product categories from the suggestions.
 */
export function buildComparison(products, browsed) {
    if (products.length === 0)
        return null;
    const prices = products.map((p) => p.price).filter((p) => p > 0);
    if (prices.length === 0)
        return null;
    // Resolve real categories: match suggestions back to browsed products
    const categorySource = browsed ?? [];
    const categoryMap = new Map(categorySource.map((b) => [b.id, b.category]));
    const categories = [
        ...new Set(products.map((p) => categoryMap.get(p.id) ?? "general")),
    ];
    return {
        count: products.length,
        priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
        categories,
    };
}
function toSuggestion(p) {
    return {
        id: p.id,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl,
        url: p.url,
        reason: "",
    };
}
//# sourceMappingURL=product-intelligence.js.map