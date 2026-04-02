import { SHOPIFY_SELECTORS } from "./platform-detectors/shopify.js";
import { WOOCOMMERCE_SELECTORS } from "./platform-detectors/woocommerce.js";
import { MAGENTO_SELECTORS } from "./platform-detectors/magento.js";
import { GENERIC_PLATFORM_SELECTORS } from "./platform-detectors/generic.js";
/**
 * Generate tracking hooks for a detected platform.
 */
export function generateHooks(platform) {
    const selectors = getSelectorsForPlatform(platform);
    const observerConfig = {
        mutationTargets: [
            ...selectors.cartCount,
            ...selectors.cartTotal,
        ],
        clickTargets: [
            ...selectors.addToCart,
            ...selectors.checkoutButton,
        ],
        intersectionTargets: [
            ...selectors.productImage,
            ...selectors.reviewSection,
        ],
        enableCartPolling: platform === "shopify",
        cartPollIntervalMs: platform === "shopify" ? 10000 : 0,
    };
    const eventMappings = [
        // ATC click
        ...selectors.addToCart.map((sel) => ({
            selector: sel,
            domEvent: "click",
            category: "cart",
            eventType: "add_to_cart_click",
            frictionId: null,
        })),
        // Checkout click
        ...selectors.checkoutButton.map((sel) => ({
            selector: sel,
            domEvent: "click",
            category: "checkout",
            eventType: "checkout_initiated",
            frictionId: null,
        })),
        // Search input focus
        ...selectors.searchInput.map((sel) => ({
            selector: sel,
            domEvent: "focus",
            category: "search",
            eventType: "search_initiated",
            frictionId: null,
        })),
    ];
    return { platform, selectors, observerConfig, eventMappings };
}
function getSelectorsForPlatform(platform) {
    switch (platform) {
        case "shopify":
            return SHOPIFY_SELECTORS;
        case "woocommerce":
            return WOOCOMMERCE_SELECTORS;
        case "magento":
            return MAGENTO_SELECTORS;
        default:
            return GENERIC_PLATFORM_SELECTORS;
    }
}
//# sourceMappingURL=hook-generator.js.map