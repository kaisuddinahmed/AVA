export interface ShopifyMappingResult {
    shop: string;
    siteConfigId: string;
    analyzerRunId: string;
    behaviorMappingsCreated: number;
    frictionMappingsCreated: number;
    behaviorCoveragePercent: number;
    themeName: string | null;
    productCount: number;
}
/**
 * Seeds high-confidence Shopify selector mappings for a newly installed store.
 * Called from the OAuth callback after SiteConfig is created.
 *
 * Returns a coverage summary — behavior coverage should be ≥90% immediately.
 */
export declare function seedShopifyMappings(shop: string, accessToken: string): Promise<ShopifyMappingResult>;
//# sourceMappingURL=shopify-mapper.service.d.ts.map