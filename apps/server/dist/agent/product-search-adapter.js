/**
 * Product Search Adapter — Story 12: Conversational Shopping Agent
 * Copy to: apps/server/src/agent/product-search-adapter.ts
 *
 * Three adapters, selected automatically based on SiteConfig:
 *
 *   ShopifyStorefront  — GraphQL Storefront API (preferred when token present)
 *   Generic            — HTTP GET + JSON-LD / JSON response extraction
 *   KeywordFallback    — Returns navigation URL when no search API configured
 *
 * All results are normalised to ProductResult[] and ranked by matchScore.
 */
import { logger } from "../logger.js";
const log = logger.child({ service: "agent" });
// ─── Relevance scoring ────────────────────────────────────────────────────────
function score(raw, intent) {
    let s = 0.5;
    const matched = [];
    const text = `${raw.title} ${raw.description ?? ''}`.toLowerCase();
    if (intent.category && text.includes(intent.category.toLowerCase())) {
        s += 0.25;
        matched.push(intent.category);
    }
    for (const attr of intent.attributes) {
        if (text.includes(attr.toLowerCase())) {
            s += 0.1;
            matched.push(attr);
        }
    }
    const pc = intent.priceConstraint;
    if (pc) {
        if (pc.max !== undefined && raw.price > pc.max)
            s -= 0.4;
        if (pc.min !== undefined && raw.price < pc.min)
            s -= 0.2;
        if (pc.around !== undefined)
            s -= Math.min(0.3, Math.abs(raw.price - pc.around) / pc.around);
    }
    return { ...raw, matchScore: Math.max(0, Math.min(1, s)), matchedAttributes: matched };
}
function rank(results) {
    return [...results].sort((a, b) => b.matchScore - a.matchScore);
}
// ─── Shopify Storefront GraphQL ───────────────────────────────────────────────
const GQL = `query SearchProducts($q: String!, $n: Int!) {
  products(query: $q, first: $n) {
    edges { node {
      id title description vendor tags
      priceRange { minVariantPrice { amount currencyCode } }
      featuredImage { url }
      onlineStoreUrl
      variants(first: 5) { edges { node { id title priceV2 { amount } availableForSale } } }
    }}
  }
}`;
async function shopifySearch(cfg, intent) {
    const store = cfg.shopifyStoreName
        ?? new URL(cfg.siteUrl).hostname.replace(/\.myshopify\.com$/, '');
    const endpoint = `https://${store}.myshopify.com/api/2024-01/graphql.json`;
    const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
    if (!q.trim())
        return [];
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': cfg.shopifyStorefrontToken,
        },
        body: JSON.stringify({ query: GQL, variables: { q, n: 8 } }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
        throw new Error(`Shopify ${res.status}`);
    const data = (await res.json());
    return rank(data.data.products.edges.map(({ node: n }) => {
        const priceNode = n.priceRange.minVariantPrice;
        const variants = (n.variants.edges ?? []).map(e => ({
            id: String(e.node.id),
            title: String(e.node.title),
            price: parseFloat(String(e.node.priceV2?.amount ?? 0)),
            available: Boolean(e.node.availableForSale),
        }));
        return score({
            id: String(n.id),
            title: String(n.title),
            price: parseFloat(priceNode.amount),
            currency: priceNode.currencyCode ?? 'USD',
            imageUrl: String(n.featuredImage?.url ?? ''),
            productUrl: String(n.onlineStoreUrl ?? `${cfg.siteUrl}/products/${n.id}`),
            description: String(n.description ?? ''),
            vendor: String(n.vendor ?? ''),
            tags: n.tags ?? [],
            variants,
        }, intent);
    }));
}
// ─── Generic HTTP + JSON-LD ───────────────────────────────────────────────────
async function genericSearch(cfg, intent) {
    if (!cfg.searchUrl)
        return [];
    const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
    if (!q.trim())
        return [];
    const url = cfg.searchUrl.replace('{query}', encodeURIComponent(q));
    const res = await fetch(url, {
        headers: { Accept: 'text/html,application/json,*/*', 'User-Agent': 'AVA-Agent/1.0' },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
        return [];
    const ct = res.headers.get('content-type') ?? '';
    // ── JSON API ──
    if (ct.includes('application/json')) {
        const data = (await res.json());
        const items = (data.products ?? data.items ?? data.results ?? data.hits ?? []);
        return rank(items.slice(0, 8).map((item) => score({
            id: String(item.id ?? Math.random()),
            title: String(item.title ?? item.name ?? ''),
            price: parseFloat(String(item.price ?? item.amount ?? 0)),
            currency: String(item.currency ?? item.currency_code ?? 'USD'),
            imageUrl: String(item.image ?? item.featured_image ?? item.imageUrl ?? ''),
            productUrl: String(item.url ?? item.handle
                ? `${cfg.siteUrl}/products/${item.handle}` : cfg.siteUrl),
            description: String(item.description ?? ''),
        }, intent)));
    }
    // ── HTML: JSON-LD extraction ──
    const html = await res.text();
    const products = [];
    const ldMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of ldMatches) {
        try {
            const data = JSON.parse(m[1]);
            const items = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
            for (const item of items) {
                if (item['@type'] !== 'Product')
                    continue;
                const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                products.push(score({
                    id: String(item['@id'] ?? item.sku ?? Math.random()),
                    title: String(item.name ?? ''),
                    price: parseFloat(String(offer?.price ?? 0)),
                    currency: String(offer?.priceCurrency ?? 'USD'),
                    imageUrl: String(Array.isArray(item.image) ? item.image[0] : (item.image?.url ?? item.image ?? '')),
                    productUrl: String(offer?.url ?? item.url ?? cfg.siteUrl),
                    description: String(item.description ?? ''),
                }, intent));
                if (products.length >= 8)
                    break;
            }
        }
        catch { /* malformed JSON-LD — skip */ }
        if (products.length >= 8)
            break;
    }
    return rank(products);
}
// ─── Demo store in-memory catalog ────────────────────────────────────────────
// Used when siteUrl is the local demo store (no real search adapter available).
const DEMO_PRODUCTS = [
    { id: 'trench-coat', title: 'Classic Trench Coat', price: 110, currency: 'USD', category: 'clothing', gender: 'women', tags: ['coat', 'clothing', 'trench', 'waterproof', 'jacket'], imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Waterproof cotton double-breasted belted trench coat' },
    { id: 'summer-dress', title: 'Floral Summer Dress', price: 71, currency: 'USD', category: 'clothing', gender: 'women', tags: ['dress', 'clothing', 'silk', 'floral', 'summer'], imageUrl: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=500', productUrl: 'http://localhost:3001', description: '100% silk floral print midi dress' },
    { id: 'urban-sneakers', title: 'Urban Street Sneakers', price: 94, currency: 'USD', category: 'footwear', gender: 'men', tags: ['sneakers', 'shoes', 'footwear', 'sport', 'casual', 'mesh'], imageUrl: 'https://images.unsplash.com/photo-1607792246307-2c7ba687b50a?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Breathable mesh memory foam high-grip sole sneakers' },
    { id: 'silver-watch', title: 'Minimalist Silver Watch', price: 249, currency: 'USD', category: 'watches', gender: 'men', tags: ['watch', 'watches', 'silver', 'stainless', 'minimalist'], imageUrl: 'https://images.unsplash.com/photo-1461141346587-763ab02bced9?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Stainless steel sapphire glass 5ATM water resistant watch' },
    { id: 'chic-shades', title: 'Designer Aviator Shades', price: 135, currency: 'USD', category: 'accessories', gender: 'unisex', tags: ['sunglasses', 'accessories', 'aviator', 'polarized', 'uv400'], imageUrl: 'https://images.unsplash.com/photo-1662091131946-338d213f4a39?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Polarized gold frame UV400 aviator sunglasses' },
    { id: 'leather-bag', title: 'Vintage Leather Satchel', price: 169, currency: 'USD', category: 'accessories', gender: 'unisex', tags: ['bag', 'satchel', 'leather', 'accessories', 'laptop'], imageUrl: 'https://images.unsplash.com/photo-1663585703603-9be01a72a62a?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Full-grain vegetable-tanned leather laptop satchel with brass hardware' },
    { id: 'boots-leather', title: 'Classic Chelsea Boots', price: 144, currency: 'USD', category: 'footwear', gender: 'men', tags: ['boots', 'shoes', 'footwear', 'leather', 'chelsea', 'formal'], imageUrl: 'https://images.unsplash.com/photo-1607792246387-4765c382c5a7?q=80&w=500', productUrl: 'http://localhost:3001', description: 'Genuine leather elastic side chelsea boots non-slip sole' },
    { id: 'smart-ring-fashion', title: 'Luxury Smart Ring', price: 299, currency: 'USD', category: 'accessories', gender: 'unisex', tags: ['ring', 'smart', 'accessories', 'gold', 'tech', 'fitness'], imageUrl: 'https://images.unsplash.com/photo-1671960610018-f2fdebbe5b47?q=80&w=500', productUrl: 'http://localhost:3001', description: '18k gold finish smart ring with sleep and heart rate tracking' },
];
function demoStoreSearch(intent) {
    const q = [intent.category, intent.raw, ...intent.attributes].join(' ').toLowerCase();
    // Gender filter
    const womenTerms = ['women', 'woman', 'female', 'ladies', 'girl'];
    const menTerms = ['men', 'man', 'male', 'guy'];
    const wantWomen = womenTerms.some(t => q.includes(t));
    const wantMen = menTerms.some(t => q.includes(t));
    const filtered = DEMO_PRODUCTS.filter(p => {
        if (wantWomen && p.gender === 'men')
            return false;
        if (wantMen && p.gender === 'women')
            return false;
        return true;
    });
    return rank(filtered.map(p => score(p, intent)));
}
// ─── Fallback navigation URL ──────────────────────────────────────────────────
function fallbackUrl(cfg, intent) {
    const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
    if (cfg.searchUrl)
        return cfg.searchUrl.replace('{query}', encodeURIComponent(q));
    return `${cfg.siteUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}`;
}
const DEMO_STORE_HOSTNAMES = ['localhost:3001', '127.0.0.1:3001'];
export async function searchProducts(cfg, intent) {
    if (cfg.shopifyStorefrontToken) {
        try {
            return { products: await shopifySearch(cfg, intent), adapterUsed: 'shopify' };
        }
        catch (e) {
            log.warn('[AVA agent] Shopify adapter error, falling back:', e);
        }
    }
    if (cfg.searchUrl) {
        try {
            const products = await genericSearch(cfg, intent);
            if (products.length)
                return { products, adapterUsed: 'generic' };
        }
        catch (e) {
            log.warn('[AVA agent] Generic adapter error, falling back:', e);
        }
    }
    // Demo store: use in-memory catalog instead of fallback navigation
    try {
        const host = new URL(cfg.siteUrl).host;
        if (DEMO_STORE_HOSTNAMES.some(h => host.includes(h))) {
            const products = demoStoreSearch(intent);
            if (products.length)
                return { products, adapterUsed: 'generic' };
        }
    }
    catch { /* malformed siteUrl — proceed to fallback */ }
    return { products: [], fallbackUrl: fallbackUrl(cfg, intent), adapterUsed: 'fallback' };
}
//# sourceMappingURL=product-search-adapter.js.map