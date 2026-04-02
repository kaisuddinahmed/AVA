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
import type { ParsedIntent, ProductResult, SiteAdapterConfig } from './agent.types.js';
export interface SearchResult {
    products: ProductResult[];
    fallbackUrl?: string;
    adapterUsed: 'shopify' | 'generic' | 'fallback';
}
export declare function searchProducts(cfg: SiteAdapterConfig, intent: ParsedIntent): Promise<SearchResult>;
//# sourceMappingURL=product-search-adapter.d.ts.map