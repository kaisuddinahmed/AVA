/**
 * Product Intelligence — derives product suggestions from session browsing history.
 *
 * No vector DB required: product context is extracted from rawSignals on
 * product_detail_view and add_to_cart events that the widget already captures.
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
  priceRange: { min: number; max: number };
  categories: string[];
}

// Represents a product extracted from a session event's rawSignals
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

// Raw signals shape from widget's product_detail_view / add_to_cart events
interface ProductRawSignals {
  product_id?: string;
  product_name?: string;
  price?: number | string;
  image_url?: string;
  product_url?: string;
  category?: string;
  url?: string;
}

interface SessionEvent {
  eventType?: string;
  type?: string;
  frictionId?: string | null;
  signals?: Record<string, unknown>;
}

/**
 * Extract browsed products from session event history.
 * Deduplicates by product_id and tracks view count + cart status.
 */
export function extractProductsFromEvents(
  events: SessionEvent[]
): BrowsedProduct[] {
  const productMap = new Map<string, BrowsedProduct>();

  for (const event of events) {
    const eventType = (event.eventType ?? event.type ?? "") as string;
    if (
      eventType !== "product_detail_view" &&
      eventType !== "add_to_cart"
    ) {
      continue;
    }

    const signals = (event.signals ?? {}) as ProductRawSignals;
    const productId =
      signals.product_id ?? signals.product_name ?? null;
    if (!productId) continue;

    const name = signals.product_name ?? productId;
    const price = parseFloat(String(signals.price ?? "0")) || 0;
    const imageUrl = signals.image_url ?? "";
    const url = signals.product_url ?? signals.url ?? "";
    const category = signals.category ?? "general";

    const existing = productMap.get(productId);
    if (existing) {
      existing.viewCount += 1;
      if (eventType === "add_to_cart") existing.inCart = true;
    } else {
      productMap.set(productId, {
        id: productId,
        name,
        price,
        imageUrl,
        url,
        category,
        viewCount: 1,
        inCart: eventType === "add_to_cart",
      });
    }
  }

  // Sort by view count descending (highest interest first)
  return Array.from(productMap.values()).sort(
    (a, b) => b.viewCount - a.viewCount
  );
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
export function findAlternatives(
  frictionId: string,
  context: { events: SessionEvent[]; cartValue: number; frictionIds: string[] }
): ProductSuggestion[] {
  const browsed = extractProductsFromEvents(context.events);
  if (browsed.length === 0) return [];

  const notInCart = browsed.filter((p) => !p.inCart);

  // Out-of-stock: suggest same-category alternatives not in cart
  if (frictionId === "F053" || frictionId === "F054") {
    const inCartCategories = new Set(
      browsed.filter((p) => p.inCart).map((p) => p.category)
    );
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
  const isPriceFriction =
    frictionId >= "F100" && frictionId <= "F115";
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
  const isCheckoutFriction =
    frictionId === "F096" ||
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
export function findComplementary(
  productId: string,
  context: { events: SessionEvent[] }
): ProductSuggestion[] {
  const browsed = extractProductsFromEvents(context.events);
  const anchor = browsed.find((p) => p.id === productId);

  const candidates = browsed.filter(
    (p) => p.id !== productId && !p.inCart
  );

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
 */
export function buildComparison(
  products: ProductSuggestion[]
): ProductComparison | null {
  if (products.length === 0) return null;

  const prices = products.map((p) => p.price).filter((p) => p > 0);
  if (prices.length === 0) return null;

  const categories = [...new Set(products.map((_, i) => String(i)))]; // placeholder
  return {
    count: products.length,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    categories,
  };
}

function toSuggestion(p: BrowsedProduct): ProductSuggestion {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    imageUrl: p.imageUrl,
    url: p.url,
    reason: "",
  };
}
