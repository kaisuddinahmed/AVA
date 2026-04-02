/**
 * WooCommerce Platform Detector — Selectors and detection for WooCommerce stores.
 */
export const WOOCOMMERCE_INDICATORS = [
    "body.woocommerce",
    "meta[name='generator'][content*='WooCommerce']",
    ".woocommerce",
    "script[src*='woocommerce']",
];
export function isWooCommerce(html) {
    return (html.includes("woocommerce") ||
        html.includes("wc-cart") ||
        html.includes("wp-content/plugins/woocommerce"));
}
export const WOOCOMMERCE_SELECTORS = {
    addToCart: [
        ".single_add_to_cart_button",
        "button.add_to_cart_button",
        ".add_to_cart_button",
        "button[name='add-to-cart']",
        ".ajax_add_to_cart",
    ],
    cartCount: [
        ".cart-contents-count",
        ".cart-count",
        ".cart-contents .count",
        ".mini-cart-count",
    ],
    cartTotal: [
        ".cart-contents .amount",
        ".cart-subtotal .amount",
        ".woocommerce-cart-form .cart-subtotal",
        ".order-total .amount",
    ],
    searchInput: [
        ".woocommerce-product-search input[type='search']",
        "input[name='s']",
        ".search-field",
    ],
    productTitle: [
        ".product_title",
        ".woocommerce-loop-product__title",
        "h1.entry-title",
        ".summary h1",
    ],
    productPrice: [
        ".summary .price",
        "p.price",
        ".woocommerce-Price-amount",
        ".price ins .amount",
        "span.price",
    ],
    productImage: [
        ".woocommerce-product-gallery img",
        ".wp-post-image",
        ".woocommerce-main-image img",
        ".product-thumbnail img",
    ],
    checkoutButton: [
        ".checkout-button",
        "a.checkout-button",
        ".wc-proceed-to-checkout a",
        "a[href*='checkout']",
    ],
    reviewSection: [
        "#reviews",
        ".woocommerce-Reviews",
        "#tab-reviews",
    ],
    breadcrumb: [
        ".woocommerce-breadcrumb",
        "nav.woocommerce-breadcrumb",
        ".breadcrumb",
    ],
};
//# sourceMappingURL=woocommerce.js.map