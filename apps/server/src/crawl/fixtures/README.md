# Crawl Fixtures

Realistic HTML/XML samples used by the page classifier and sitemap parser tests.

Each file captures the **essential markers** the classifier relies on, not full
page bloat. PII is sanitized; URLs are demo-store URLs; prices/SKUs are made up.

## What's in each file

| File | Source theme | Page type | Key markers |
|------|---|---|---|
| `shopify-pdp-dawn.html` | Shopify Dawn 8.x | `pdp` | URL `/products/:handle`, JSON-LD `Product`, `[data-product-form]`, body class `template-product` |
| `shopify-collection-dawn.html` | Shopify Dawn 8.x | `category` | URL `/collections/:handle`, body class `template-collection`, `.product-grid`, JSON-LD `ItemList` |
| `shopify-cart-dawn.html` | Shopify Dawn 8.x | `cart` | URL `/cart`, body class `template-cart`, `<form action="/cart">`, `[data-cart-line]` |
| `shopify-checkout-dawn.html` | Shopify Checkout | `checkout` | URL `/checkouts/:token`, body class `checkout`, `[data-step="contact_information"]` |
| `woocommerce-pdp-storefront.html` | Storefront theme | `pdp` | URL `/product/:slug`, body class `single-product`, JSON-LD `Product`, `.cart` form |
| `woocommerce-category-storefront.html` | Storefront theme | `category` | URL `/product-category/:slug`, body class `archive`, `.products` grid |
| `sitemap-shopify.xml` | Shopify | — | Single `<urlset>` with mixed PDP/collection URLs |
| `sitemap-index.xml` | Generic | — | `<sitemapindex>` pointing to multiple child sitemaps |

## Updating fixtures

Fixtures are reference data, not generated. Hand-edit when:
1. A theme update changes the canonical DOM (rare, document in commit).
2. A new platform/theme is added — create a new file with a clear name.

Don't auto-fetch live HTML into fixtures: live pages contain ad scripts, A/B
content, and PII. Keep these small and intentional.
