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

import type { ParsedIntent, ProductResult, ProductVariant, SiteAdapterConfig } from './agent.types.js';

// ─── Relevance scoring ────────────────────────────────────────────────────────

function score(
  raw: Omit<ProductResult, 'matchScore' | 'matchedAttributes'>,
  intent: ParsedIntent,
): ProductResult {
  let s = 0.5;
  const matched: string[] = [];
  const text = `${raw.title} ${raw.description ?? ''}`.toLowerCase();

  if (intent.category && text.includes(intent.category.toLowerCase())) { s += 0.25; matched.push(intent.category); }
  for (const attr of intent.attributes) {
    if (text.includes(attr.toLowerCase())) { s += 0.1; matched.push(attr); }
  }

  const pc = intent.priceConstraint;
  if (pc) {
    if (pc.max !== undefined && raw.price > pc.max) s -= 0.4;
    if (pc.min !== undefined && raw.price < pc.min) s -= 0.2;
    if (pc.around !== undefined) s -= Math.min(0.3, Math.abs(raw.price - pc.around) / pc.around);
  }

  return { ...raw, matchScore: Math.max(0, Math.min(1, s)), matchedAttributes: matched };
}

function rank(results: ProductResult[]): ProductResult[] {
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

async function shopifySearch(cfg: SiteAdapterConfig, intent: ParsedIntent): Promise<ProductResult[]> {
  const store = cfg.shopifyStoreName
    ?? new URL(cfg.siteUrl).hostname.replace(/\.myshopify\.com$/, '');
  const endpoint = `https://${store}.myshopify.com/api/2024-01/graphql.json`;
  const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
  if (!q.trim()) return [];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': cfg.shopifyStorefrontToken!,
    },
    body: JSON.stringify({ query: GQL, variables: { q, n: 8 } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}`);

  type GQLResp = { data: { products: { edges: Array<{ node: Record<string, unknown> }> } } };
  const data = (await res.json()) as GQLResp;

  return rank(data.data.products.edges.map(({ node: n }) => {
    const priceNode = (n.priceRange as Record<string, Record<string, string>>).minVariantPrice;
    const variants: ProductVariant[] = ((n.variants as Record<string, Array<{node: Record<string, unknown>}>>).edges ?? []).map(e => ({
      id: String(e.node.id),
      title: String(e.node.title),
      price: parseFloat(String((e.node.priceV2 as Record<string, string>)?.amount ?? 0)),
      available: Boolean(e.node.availableForSale),
    }));
    return score({
      id: String(n.id),
      title: String(n.title),
      price: parseFloat(priceNode.amount),
      currency: priceNode.currencyCode ?? 'USD',
      imageUrl: String((n.featuredImage as Record<string,string>)?.url ?? ''),
      productUrl: String(n.onlineStoreUrl ?? `${cfg.siteUrl}/products/${n.id}`),
      description: String(n.description ?? ''),
      vendor: String(n.vendor ?? ''),
      tags: (n.tags as string[]) ?? [],
      variants,
    }, intent);
  }));
}

// ─── Generic HTTP + JSON-LD ───────────────────────────────────────────────────

async function genericSearch(cfg: SiteAdapterConfig, intent: ParsedIntent): Promise<ProductResult[]> {
  if (!cfg.searchUrl) return [];
  const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
  if (!q.trim()) return [];

  const url = cfg.searchUrl.replace('{query}', encodeURIComponent(q));
  const res = await fetch(url, {
    headers: { Accept: 'text/html,application/json,*/*', 'User-Agent': 'AVA-Agent/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const ct = res.headers.get('content-type') ?? '';

  // ── JSON API ──
  if (ct.includes('application/json')) {
    type Item = Record<string, unknown>;
    const data = (await res.json()) as Record<string, unknown>;
    const items = (data.products ?? data.items ?? data.results ?? data.hits ?? []) as Item[];
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
  const products: ProductResult[] = [];
  const ldMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
      for (const item of items) {
        if (item['@type'] !== 'Product') continue;
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
        if (products.length >= 8) break;
      }
    } catch { /* malformed JSON-LD — skip */ }
    if (products.length >= 8) break;
  }
  return rank(products);
}

// ─── Fallback navigation URL ──────────────────────────────────────────────────

function fallbackUrl(cfg: SiteAdapterConfig, intent: ParsedIntent): string {
  const q = [intent.category, ...intent.attributes].filter(Boolean).join(' ');
  if (cfg.searchUrl) return cfg.searchUrl.replace('{query}', encodeURIComponent(q));
  return `${cfg.siteUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}`;
}

// ─── Public ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  products: ProductResult[];
  fallbackUrl?: string;
  adapterUsed: 'shopify' | 'generic' | 'fallback';
}

export async function searchProducts(cfg: SiteAdapterConfig, intent: ParsedIntent): Promise<SearchResult> {
  if (cfg.shopifyStorefrontToken) {
    try { return { products: await shopifySearch(cfg, intent), adapterUsed: 'shopify' }; }
    catch (e) { console.warn('[AVA agent] Shopify adapter error, falling back:', e); }
  }
  if (cfg.searchUrl) {
    try {
      const products = await genericSearch(cfg, intent);
      if (products.length) return { products, adapterUsed: 'generic' };
    } catch (e) { console.warn('[AVA agent] Generic adapter error, falling back:', e); }
  }
  return { products: [], fallbackUrl: fallbackUrl(cfg, intent), adapterUsed: 'fallback' };
}
