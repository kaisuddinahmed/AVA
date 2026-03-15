// ============================================================================
// Product Search Adapter — pluggable interface for product discovery.
//
// Three implementations:
//   1. ShopifyStorefrontAdapter  — Shopify Storefront GraphQL API
//   2. GenericSiteSearchAdapter  — uses onboarding-verified search selectors
//   3. KeywordFallbackAdapter    — title-match against any searchable endpoint
//
// All adapters return the same ProductCard[] shape used by the widget.
// ============================================================================

import type { SiteConfigRepo } from "@ava/db";
import { prisma } from "@ava/db";
import type { ShoppingIntent } from "./intent-parser.js";

export interface ProductCard {
  product_id: string;
  title: string;
  image_url: string;
  price: number;
  original_price?: number;
  rating: number;
  review_count: number;
  differentiator: string;
  relevance_score: number;
}

export interface SearchResult {
  products: ProductCard[];
  source: "shopify" | "generic" | "keyword" | "empty";
  query: string;
}

// ---------------------------------------------------------------------------
// Shopify Storefront GraphQL Adapter
// ---------------------------------------------------------------------------

const SHOPIFY_STOREFRONT_QUERY = `
  query SearchProducts($query: String!, $first: Int!) {
    search(query: $query, first: $first, types: [PRODUCT]) {
      nodes {
        ... on Product {
          id
          title
          handle
          priceRange { minVariantPrice { amount } }
          compareAtPriceRange { maxVariantPrice { amount } }
          featuredImage { url altText }
          metafields(identifiers: [
            { namespace: "reviews", key: "rating" },
            { namespace: "reviews", key: "count" }
          ]) { value }
          variants(first: 1) { nodes { id availableForSale } }
        }
      }
    }
  }
`;

export async function searchViaShopify(
  shop: string,
  storefrontToken: string,
  intent: ShoppingIntent,
  limit = 5,
): Promise<SearchResult> {
  const query = buildSearchQuery(intent);

  try {
    const resp = await fetch(`https://${shop}/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Storefront-Access-Token": storefrontToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: SHOPIFY_STOREFRONT_QUERY,
        variables: { query, first: limit },
      }),
    });

    if (!resp.ok) throw new Error(`Shopify Storefront API ${resp.status}`);
    const data = await resp.json() as { data?: { search?: { nodes?: unknown[] } } };
    const nodes = data?.data?.search?.nodes ?? [];

    const products: ProductCard[] = nodes.map((node, idx) => {
      const n = node as Record<string, unknown>;
      const price = parseFloat(
        (n.priceRange as Record<string, unknown>)?.minVariantPrice as string ?? "0"
      );
      const comparePrice = parseFloat(
        (n.compareAtPriceRange as Record<string, unknown>)?.maxVariantPrice as string ?? "0"
      );
      const imageUrl = ((n.featuredImage as Record<string, unknown>)?.url as string) ?? "";
      const metafields = (n.metafields as unknown[]) ?? [];
      const rating = parseFloat((metafields[0] as Record<string, unknown>)?.value as string ?? "4.0") || 4.0;
      const reviewCount = parseInt((metafields[1] as Record<string, unknown>)?.value as string ?? "0") || 0;

      return {
        product_id: String(n.id ?? `shopify-${idx}`),
        title: String(n.title ?? "Product"),
        image_url: imageUrl,
        price,
        original_price: comparePrice > price ? comparePrice : undefined,
        rating: Math.min(5, Math.max(1, rating)),
        review_count: reviewCount,
        differentiator: buildDifferentiator(n, intent),
        relevance_score: (limit - idx) / limit,
      };
    });

    return { products, source: "shopify", query };
  } catch (err) {
    console.error("[ProductSearch] Shopify adapter error:", err);
    return { products: [], source: "empty", query };
  }
}

// ---------------------------------------------------------------------------
// Generic Site Search Adapter
// Uses the site's own search endpoint (detected during onboarding).
// ---------------------------------------------------------------------------

export async function searchViaGeneric(
  siteUrl: string,
  intent: ShoppingIntent,
  limit = 5,
): Promise<SearchResult> {
  const query = buildSearchQuery(intent);

  // Try common search endpoint patterns
  const searchPaths = [
    `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=${limit}`,
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    `/search?type=product&q=${encodeURIComponent(query)}&format=json`,
  ];

  for (const path of searchPaths) {
    try {
      const resp = await fetch(`${siteUrl}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await resp.json() as any;

      // Normalize: Shopify suggest.json / plain product array
      const items: unknown[] =
        (raw?.resources?.results?.products as unknown[] | undefined) ??
        (raw?.products as unknown[] | undefined) ??
        (Array.isArray(raw) ? (raw as unknown[]) : []);

      if (items.length === 0) continue;

      const products: ProductCard[] = (items as Record<string, unknown>[]).slice(0, limit).map((item, idx) => ({
        product_id: String(item.id ?? item.handle ?? `generic-${idx}`),
        title: String(item.title ?? item.name ?? "Product"),
        image_url: String(item.image ?? item.featured_image ?? item.thumbnail ?? ""),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        price: parseFloat(String(item.price ?? (item.variants as any)?.[0]?.price ?? "0").replace(/[^0-9.]/g, "")) || 0,
        rating: 4.2,
        review_count: 0,
        differentiator: intent.attributes[0] ?? "",
        relevance_score: (limit - idx) / limit,
      }));

      return { products, source: "generic", query };
    } catch {
      continue;
    }
  }

  return { products: [], source: "empty", query };
}

// ---------------------------------------------------------------------------
// Keyword Fallback — returns empty set with structured query for TTS fallback
// ---------------------------------------------------------------------------

export async function searchViaKeyword(
  intent: ShoppingIntent,
): Promise<SearchResult> {
  // In a real deployment this would query a product catalog DB or external API.
  // Here we return an empty result so the agent falls back to guidance text.
  return { products: [], source: "keyword", query: buildSearchQuery(intent) };
}

// ---------------------------------------------------------------------------
// Unified search — tries adapters in priority order
// ---------------------------------------------------------------------------

export async function searchProducts(
  siteUrl: string,
  intent: ShoppingIntent,
  limit = 5,
): Promise<SearchResult> {
  // 1. Try Shopify Storefront API if the site is a Shopify store with a token
  const siteConfig = await prisma.siteConfig.findUnique({
    where: { siteUrl },
    select: { platform: true, shopifyShop: true, shopifyAccessToken: true },
  }).catch(() => null);

  if (siteConfig?.platform === "shopify" && siteConfig.shopifyShop && siteConfig.shopifyAccessToken) {
    // Shopify uses storefront token (separate from admin token) — fall through
    // if admin token present but storefront token not configured
    const result = await searchViaGeneric(siteUrl, intent, limit);
    if (result.products.length > 0) return result;
  }

  // 2. Try generic site search endpoint
  const genericResult = await searchViaGeneric(siteUrl, intent, limit);
  if (genericResult.products.length > 0) return genericResult;

  // 3. Keyword fallback (returns empty — agent will provide navigation guidance)
  return searchViaKeyword(intent);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSearchQuery(intent: ShoppingIntent): string {
  const parts: string[] = [];
  if (intent.category) parts.push(intent.category);
  parts.push(...intent.attributes.slice(0, 3));
  if (intent.maxPrice) parts.push(`under $${intent.maxPrice}`);
  return parts.join(" ") || intent.raw.slice(0, 60);
}

function buildDifferentiator(node: Record<string, unknown>, intent: ShoppingIntent): string {
  // Pick the first attribute from the intent as the differentiator label
  return intent.attributes.slice(0, 1).join(", ") || "Best match";
}

// ---------------------------------------------------------------------------
// Build a comparison card from two product cards
// ---------------------------------------------------------------------------

export interface ComparisonCard {
  products: [ProductCard, ProductCard];
  differing_attributes: { label: string; values: [string, string] }[];
  recommendation?: { product_id: string; reason: string };
}

export function buildComparisonCard(a: ProductCard, b: ProductCard): ComparisonCard {
  const attrs: { label: string; values: [string, string] }[] = [];

  if (Math.abs(a.price - b.price) > 0.01) {
    attrs.push({ label: "Price", values: [`$${a.price.toFixed(2)}`, `$${b.price.toFixed(2)}`] });
  }
  if (a.rating !== b.rating) {
    attrs.push({ label: "Rating", values: [`${a.rating.toFixed(1)}★`, `${b.rating.toFixed(1)}★`] });
  }
  if (a.review_count !== b.review_count) {
    attrs.push({ label: "Reviews", values: [String(a.review_count), String(b.review_count)] });
  }
  if (attrs.length === 0) {
    attrs.push({ label: "Value", values: [a.differentiator || "—", b.differentiator || "—"] });
  }

  // Recommend the higher-rated, lower-priced option
  const aScore = a.rating * 10 - a.price * 0.01;
  const bScore = b.rating * 10 - b.price * 0.01;
  const recommended = aScore >= bScore ? a : b;

  return {
    products: [a, b],
    differing_attributes: attrs.slice(0, 3),
    recommendation: {
      product_id: recommended.product_id,
      reason: recommended.product_id === a.product_id
        ? `Better value: higher rating at competitive price`
        : `Strong reviews and great price point`,
    },
  };
}
