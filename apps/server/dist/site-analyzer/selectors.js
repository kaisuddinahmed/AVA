/**
 * Selectors — CSS selector patterns for detecting e-commerce elements.
 * Used by platform detectors and the hook generator.
 */
/** Generic selectors that work across many e-commerce platforms. */
export const GENERIC_SELECTORS = {
    addToCart: [
        "[data-action='add-to-cart']",
        ".add-to-cart",
        "button[name='add']",
        "form[action*='/cart'] button[type='submit']",
    ],
    cartCount: [
        ".cart-count",
        "[data-cart-count]",
        ".cart-badge",
        "#cart-count",
        ".cart-item-count",
    ],
    cartTotal: [
        ".cart-total",
        "[data-cart-total]",
        ".cart-subtotal",
        ".order-total",
    ],
    searchInput: [
        "input[type='search']",
        ".search-input",
        "input[name='q']",
        "input[name='search']",
        "form[action*='search'] input",
        "[role='searchbox']",
    ],
    productTitle: [
        ".product-title",
        ".product__title",
        "h1.product-name",
        "[data-product-title]",
        "h1[itemprop='name']",
    ],
    productPrice: [
        ".product-price",
        ".price",
        "[data-price]",
        "[itemprop='price']",
        "meta[itemprop='price']",
    ],
    productImage: [
        ".product-image img",
        ".product__image img",
        "[data-product-image]",
        ".product-featured-image",
    ],
    checkoutButton: [
        "a[href*='checkout']",
        "button[name='checkout']",
        ".checkout-button",
        "#checkout",
    ],
    reviewSection: [
        ".product-reviews",
        "[data-reviews]",
        ".customer-reviews",
        "#reviews",
    ],
    breadcrumb: [
        ".breadcrumb",
        "[aria-label='breadcrumb']",
        ".breadcrumbs",
        "nav.breadcrumb",
    ],
};
/** Page type detection patterns. */
export const PAGE_TYPE_PATTERNS = {
    landing: [/^\/$/, /^\/home$/i, /^\/index/i],
    category: [/\/collection/i, /\/category/i, /\/shop\//i, /\/catalog/i],
    search_results: [/\/search/i, /[?&]q=/i, /[?&]search=/i],
    pdp: [/\/product/i, /\/item/i, /\/p\//i, /\/dp\//i],
    cart: [/\/cart/i, /\/bag/i, /\/basket/i],
    checkout: [/\/checkout/i, /\/pay/i, /\/order/i],
    account: [/\/account/i, /\/profile/i, /\/login/i, /\/register/i],
};
//# sourceMappingURL=selectors.js.map