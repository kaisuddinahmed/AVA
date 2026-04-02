/**
 * Shopify Platform Detector — Selectors and detection for Shopify stores.
 */
export const SHOPIFY_INDICATORS = [
    "window.Shopify",
    "script[src*='shopify']",
    "link[href*='shopify']",
    "meta[name='shopify-checkout-api-token']",
];
export function isShopify(html) {
    return (html.includes("Shopify.shop") ||
        html.includes("shopify.com/s/") ||
        html.includes("cdn.shopify.com") ||
        html.includes("shopify-checkout-api-token"));
}
export const SHOPIFY_SELECTORS = {
    addToCart: [
        "form[action*='/cart/add'] button[type='submit']",
        ".product-form__submit",
        "button[name='add']",
        ".shopify-payment-button button",
        "[data-add-to-cart]",
    ],
    cartCount: [
        ".cart-count-bubble",
        "[data-cart-count]",
        ".cart-count",
        ".site-header__cart-count",
        ".cart-link__bubble",
    ],
    cartTotal: [
        ".cart__subtotal",
        "[data-cart-subtotal]",
        ".cart-subtotal__price",
        ".totals__subtotal-value",
    ],
    searchInput: [
        "input[name='q']",
        ".search-bar__input",
        "predictive-search input",
        "[data-predictive-search-input]",
    ],
    productTitle: [
        ".product-single__title",
        ".product__title",
        "h1.product-title",
        "[data-product-title]",
    ],
    productPrice: [
        ".product__price",
        ".price--main .money",
        "[data-product-price]",
        ".product-single__price",
        ".price__regular .price-item--regular",
    ],
    productImage: [
        ".product-single__media img",
        ".product__media img",
        "[data-product-featured-image]",
        ".product-featured-media img",
    ],
    checkoutButton: [
        "button[name='checkout']",
        "a[href*='/checkout']",
        ".cart__checkout-button",
        "[data-checkout-button]",
    ],
    reviewSection: [
        ".product-reviews",
        ".spr-container",
        "#shopify-product-reviews",
        "[data-reviews-section]",
    ],
    breadcrumb: [
        ".breadcrumbs",
        "nav.breadcrumb",
        ".breadcrumb-list",
    ],
};
//# sourceMappingURL=shopify.js.map