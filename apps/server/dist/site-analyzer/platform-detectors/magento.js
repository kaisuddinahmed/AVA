/**
 * Magento Platform Detector — Selectors and detection for Magento stores.
 */
export const MAGENTO_INDICATORS = [
    "[data-mage-init]",
    "script[src*='mage']",
    "script[src*='requirejs']",
    ".page-wrapper .page-header",
];
export function isMagento(html) {
    return (html.includes("data-mage-init") ||
        html.includes("Magento_") ||
        html.includes("mage/cookies") ||
        html.includes("requirejs/require"));
}
export const MAGENTO_SELECTORS = {
    addToCart: [
        "#product-addtocart-button",
        "button.action.tocart",
        "button.action.primary.tocart",
        "form#product_addtocart_form button[type='submit']",
    ],
    cartCount: [
        ".counter-number",
        ".minicart-wrapper .counter",
        "[data-bind*='getCartParam']",
        ".counter.qty",
    ],
    cartTotal: [
        ".subtotal .price",
        ".cart-summary .grand.totals .price",
        ".minicart-wrapper .subtotal .price",
    ],
    searchInput: [
        "#search",
        "input[name='q']",
        ".minisearch input",
        ".search-autocomplete input",
    ],
    productTitle: [
        ".page-title .base",
        "h1.product-name",
        ".product-info-main h1",
        "[itemprop='name']",
    ],
    productPrice: [
        ".price-box .price",
        "[data-price-type='finalPrice'] .price",
        ".product-info-price .price",
        "meta[itemprop='price']",
    ],
    productImage: [
        ".product.media img",
        ".gallery-placeholder img",
        "[data-gallery-role='gallery'] img",
        ".fotorama__stage img",
    ],
    checkoutButton: [
        "button[data-role='proceed-to-checkout']",
        ".action.primary.checkout",
        "a[href*='checkout']",
        "#top-cart-btn-checkout",
    ],
    reviewSection: [
        "#customer-reviews",
        ".product-reviews-summary",
        "#reviews",
    ],
    breadcrumb: [
        ".breadcrumbs",
        ".items[role='breadcrumbs']",
        "ul.breadcrumb",
    ],
};
//# sourceMappingURL=magento.js.map