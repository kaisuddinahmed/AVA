import { FrictionMappingRepo } from "@ava/db";
import { getFrictionCatalog } from "./catalog-retriever.js";
export async function mapFrictionsForRun(input) {
    const catalog = getFrictionCatalog();
    await FrictionMappingRepo.deleteFrictionMappingsBySite(input.siteConfigId);
    const siteFunctions = buildSiteFunctionContext(input.trackingHooks);
    const rows = [];
    for (const friction of catalog) {
        const signalText = `${friction.scenario} ${friction.detection_signal}`.toLowerCase();
        const { candidates, keywordHits } = pickFunctionCandidates(signalText);
        // Skip frictions with no keyword relevance to this site
        if (keywordHits === 0)
            continue;
        // Only map to functions that are actually available on the site
        const mappedFunction = candidates.find((fn) => siteFunctions[fn].available);
        if (!mappedFunction)
            continue;
        const context = siteFunctions[mappedFunction];
        const selector = context.selectors[0];
        const ruleLikeSignal = friction.detection_signal.includes(">") ||
            friction.detection_signal.includes("<") ||
            friction.detection_signal.includes("==") ||
            friction.detection_signal.includes("AND") ||
            friction.detection_signal.includes("OR");
        const detectorType = ruleLikeSignal ? "rule" : "hybrid";
        let confidence = 0.7;
        confidence += Math.min(0.16, keywordHits * 0.02);
        confidence += (friction.severity - 50) / 250;
        confidence = clamp(confidence, 0.2, 0.95);
        const thresholdConfig = JSON.stringify({
            signalExpression: friction.detection_signal,
            severity: friction.severity,
            defaultAction: friction.ai_action,
        });
        const evidence = JSON.stringify({
            platform: input.platform,
            category: friction.category,
            scenario: friction.scenario,
            selectedFunction: mappedFunction,
            matchedKeywords: candidates,
            selectorFound: Boolean(selector),
        });
        rows.push({
            analyzerRunId: input.analyzerRunId,
            siteConfigId: input.siteConfigId,
            frictionId: friction.id,
            detectorType,
            triggerEvent: context.triggerEvent,
            selector,
            thresholdConfig,
            confidence,
            evidence,
            isVerified: confidence >= 0.75,
            isActive: true,
        });
    }
    const insertResult = await FrictionMappingRepo.createFrictionMappings(rows);
    const avgConfidence = rows.length > 0
        ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
        : 0;
    const highConfidenceMappings = rows.filter((row) => row.confidence >= 0.75).length;
    const lowConfidenceFrictionIds = rows
        .filter((row) => row.confidence < 0.75)
        .slice(0, 100)
        .map((row) => row.frictionId);
    return {
        totalFrictions: catalog.length,
        insertedMappings: insertResult.count,
        highConfidenceMappings,
        avgConfidence,
        lowConfidenceFrictionIds,
    };
}
function buildSiteFunctionContext(trackingHooks) {
    const selectors = trackingHooks.selectors;
    return {
        add_to_cart: {
            available: selectors.addToCart.length > 0,
            selectors: selectors.addToCart,
            triggerEvent: "add_to_cart_click",
        },
        cart: {
            available: selectors.cartCount.length > 0 || selectors.cartTotal.length > 0,
            selectors: [...selectors.cartCount, ...selectors.cartTotal],
            triggerEvent: "cart_interaction",
        },
        search: {
            available: selectors.searchInput.length > 0,
            selectors: selectors.searchInput,
            triggerEvent: "search_initiated",
        },
        checkout: {
            available: selectors.checkoutButton.length > 0,
            selectors: selectors.checkoutButton,
            triggerEvent: "checkout_initiated",
        },
        product: {
            available: selectors.productTitle.length > 0 || selectors.productImage.length > 0,
            selectors: [...selectors.productTitle, ...selectors.productImage],
            triggerEvent: "product_interaction",
        },
        reviews: {
            available: selectors.reviewSection.length > 0,
            selectors: selectors.reviewSection,
            triggerEvent: "review_interaction",
        },
        pricing: {
            available: selectors.productPrice.length > 0,
            selectors: selectors.productPrice,
            triggerEvent: "price_interaction",
        },
        navigation: {
            available: selectors.breadcrumb.length > 0,
            selectors: selectors.breadcrumb,
            triggerEvent: "navigation_interaction",
        },
    };
}
function firstAvailableFunction(context) {
    const functions = [
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
        if (context[fn].available)
            return fn;
    }
    return null;
}
function pickFunctionCandidates(text) {
    // Use specific, high-signal keywords — avoid generic words like "product",
    // "image", "description", "order", "form", "scroll" that appear everywhere.
    const functions = [
        {
            fn: "add_to_cart",
            score: keywordScore(text, ["add to cart", "atc", "buy button", "wishlist", "add to bag"]),
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
                "stock",
            ]),
        },
        {
            fn: "reviews",
            score: keywordScore(text, ["review", "rating", "testimonial", "social proof"]),
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
    const ranked = functions
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) {
        return { candidates: [], keywordHits: 0 };
    }
    return {
        candidates: ranked.map((item) => item.fn),
        keywordHits: ranked[0].score,
    };
}
function keywordScore(text, keywords) {
    return keywords.reduce((score, keyword) => (text.includes(keyword) ? score + 1 : score), 0);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
//# sourceMappingURL=friction-mapper.js.map