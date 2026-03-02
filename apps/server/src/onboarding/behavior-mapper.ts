import { BehaviorMappingRepo } from "@ava/db";
import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
import { getBehaviorCatalog } from "./catalog-retriever.js";

type SiteFunction =
  | "add_to_cart"
  | "cart"
  | "search"
  | "checkout"
  | "product"
  | "reviews"
  | "pricing"
  | "navigation";

interface SiteFunctionContext {
  available: boolean;
  selectors: string[];
  eventType: string;
}

export interface BehaviorMappingResult {
  totalPatterns: number;
  insertedMappings: number;
  highConfidenceMappings: number;
  avgConfidence: number;
  lowConfidencePatternIds: string[];
}

export async function mapBehaviorsForRun(input: {
  analyzerRunId: string;
  siteConfigId: string;
  platform: string;
  trackingHooks: TrackingHooks;
}): Promise<BehaviorMappingResult> {
  const catalog = getBehaviorCatalog();
  await BehaviorMappingRepo.deleteBehaviorMappingsBySite(input.siteConfigId);
  const siteFunctions = buildSiteFunctionContext(input.trackingHooks);

  const rows: Array<{
    analyzerRunId: string;
    siteConfigId: string;
    patternId: string;
    patternName: string;
    mappedFunction: string;
    eventType: string;
    selector: string | undefined;
    confidence: number;
    source: string;
    evidence: string;
    isVerified: boolean;
    isActive: boolean;
  }> = [];

  for (const pattern of catalog) {
    const { candidates, keywordHits } = pickFunctionCandidates(pattern.description);

    // Skip patterns with no keyword relevance to this site
    if (keywordHits === 0) continue;

    // Only map to functions that are actually available on the site
    const mappedFunction = candidates.find((fn) => siteFunctions[fn].available);
    if (!mappedFunction) continue;

    const context = siteFunctions[mappedFunction];
    const selector = context.selectors[0];

    let confidence = 0.72;
    confidence += Math.min(0.18, keywordHits * 0.03);
    confidence = clamp(confidence, 0.2, 0.95);

    const source = "dom_rule";
    const evidence = JSON.stringify({
      platform: input.platform,
      category: pattern.category,
      description: pattern.description,
      matchedKeywords: candidates,
      selectedFunction: mappedFunction,
      selectorFound: Boolean(selector),
    });

    rows.push({
      analyzerRunId: input.analyzerRunId,
      siteConfigId: input.siteConfigId,
      patternId: pattern.id,
      patternName: pattern.description,
      mappedFunction,
      eventType: context.eventType,
      selector,
      confidence,
      source,
      evidence,
      isVerified: confidence >= 0.75,
      isActive: true,
    });
  }

  const insertResult = await BehaviorMappingRepo.createBehaviorMappings(rows);
  const avgConfidence =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
      : 0;
  const highConfidenceMappings = rows.filter((row) => row.confidence >= 0.75).length;
  const lowConfidencePatternIds = rows
    .filter((row) => row.confidence < 0.75)
    .slice(0, 100)
    .map((row) => row.patternId);

  return {
    totalPatterns: catalog.length,
    insertedMappings: insertResult.count,
    highConfidenceMappings,
    avgConfidence,
    lowConfidencePatternIds,
  };
}

function buildSiteFunctionContext(
  trackingHooks: TrackingHooks,
): Record<SiteFunction, SiteFunctionContext> {
  const selectors = trackingHooks.selectors;

  return {
    add_to_cart: {
      available: selectors.addToCart.length > 0,
      selectors: selectors.addToCart,
      eventType: "add_to_cart_click",
    },
    cart: {
      available: selectors.cartCount.length > 0 || selectors.cartTotal.length > 0,
      selectors: [...selectors.cartCount, ...selectors.cartTotal],
      eventType: "cart_interaction",
    },
    search: {
      available: selectors.searchInput.length > 0,
      selectors: selectors.searchInput,
      eventType: "search_initiated",
    },
    checkout: {
      available: selectors.checkoutButton.length > 0,
      selectors: selectors.checkoutButton,
      eventType: "checkout_initiated",
    },
    product: {
      available: selectors.productTitle.length > 0 || selectors.productImage.length > 0,
      selectors: [...selectors.productTitle, ...selectors.productImage],
      eventType: "product_interaction",
    },
    reviews: {
      available: selectors.reviewSection.length > 0,
      selectors: selectors.reviewSection,
      eventType: "review_interaction",
    },
    pricing: {
      available: selectors.productPrice.length > 0,
      selectors: selectors.productPrice,
      eventType: "price_interaction",
    },
    navigation: {
      available: selectors.breadcrumb.length > 0,
      selectors: selectors.breadcrumb,
      eventType: "navigation_interaction",
    },
  };
}

function firstAvailableFunction(
  context: Record<SiteFunction, SiteFunctionContext>,
): SiteFunction | null {
  const functions: SiteFunction[] = [
    "add_to_cart",
    "cart",
    "search",
    "checkout",
    "product",
    "reviews",
    "pricing",
    "navigation",
  ];
  for (const fn of functions) {
    if (context[fn].available) return fn;
  }
  return null;
}

function pickFunctionCandidates(description: string): {
  candidates: SiteFunction[];
  keywordHits: number;
} {
  const text = description.toLowerCase();

  // Use specific, high-signal keywords — avoid generic words like "product",
  // "image", "description", "order", "scroll" that appear everywhere.
  const functions: Array<{ fn: SiteFunction; score: number }> = [
    {
      fn: "add_to_cart",
      score: keywordScore(text, ["add to cart", "atc", "wishlist", "buy now", "add to bag"]),
    },
    {
      fn: "cart",
      score: keywordScore(text, ["cart", "basket", "bag item", "mini-cart"]),
    },
    {
      fn: "search",
      score: keywordScore(text, ["search", "autocomplete", "search result"]),
    },
    {
      fn: "checkout",
      score: keywordScore(text, ["checkout", "payment", "billing", "place order"]),
    },
    {
      fn: "product",
      score: keywordScore(text, [
        "product page",
        "product detail",
        "pdp",
        "variant",
        "size guide",
        "size chart",
      ]),
    },
    {
      fn: "reviews",
      score: keywordScore(text, ["review", "rating", "testimonial"]),
    },
    {
      fn: "pricing",
      score: keywordScore(text, ["price compari", "coupon", "promo code", "discount code"]),
    },
    {
      fn: "navigation",
      score: keywordScore(text, ["breadcrumb", "menu", "filter", "sort by", "facet"]),
    },
  ];

  // Only consider functions with a match
  const ranked = functions
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { candidates: [], keywordHits: 0 };
  }

  // Use the top candidate's score as keywordHits (not sum across all)
  return {
    candidates: ranked.map((item) => item.fn),
    keywordHits: ranked[0].score,
  };
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.reduce(
    (score, keyword) => (text.includes(keyword) ? score + 1 : score),
    0,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
