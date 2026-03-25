/** Get site config by URL. */
export declare function getSiteConfigByUrl(siteUrl: string): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
} | null>;
/** Get site config by ID. */
export declare function getSiteConfig(id: string): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
} | null>;
/** List all site configs. */
export declare function listSiteConfigs(): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}[]>;
/** Create or update site config (upsert by siteUrl). */
export declare function upsertSiteConfig(data: {
    siteUrl: string;
    platform: string;
    trackingConfig: string;
}): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Create a new site config. */
export declare function createSiteConfig(data: {
    siteUrl: string;
    platform: string;
    trackingConfig: string;
}): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Update an existing site config. */
export declare function updateSiteConfig(id: string, data: Partial<{
    platform: string;
    trackingConfig: string;
    integrationStatus: string;
    activeAnalyzerRunId: string | null;
}>): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Delete a site config. */
export declare function deleteSiteConfig(id: string): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Update site integration status and optionally the active analyzer run. */
export declare function setIntegrationStatus(id: string, integrationStatus: string, activeAnalyzerRunId?: string | null): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Set or clear active analyzer run pointer for a site. */
export declare function setActiveAnalyzerRun(id: string, activeAnalyzerRunId: string | null): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Get tracking config (parsed JSON) for a site URL. */
export declare function getTrackingConfig(siteUrl: string): Promise<Record<string, unknown> | null>;
/** Get site config by siteKey (avak_<hex>). */
export declare function getSiteConfigBySiteKey(siteKey: string): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
} | null>;
/**
 * Generate a fresh siteKey for a site, creating the SiteConfig if it doesn't
 * exist. Existing site keys are preserved so repeated "Generate" calls do not
 * invalidate an already-installed snippet.
 */
export declare function generateSiteKeyForSite(siteUrl: string): Promise<{
    id: string;
    siteUrl: string;
    integrationStatus: string;
    createdAt: Date;
    updatedAt: Date;
    siteKey: string | null;
    platform: string;
    trackingConfig: string;
    activeAnalyzerRunId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    networkOptIn: boolean;
    shopifyShop: string | null;
    shopifyAccessToken: string | null;
    shopifyScriptTagId: number | null;
}>;
/** Get the activation policy for a site (returns null if not set → caller uses defaults). */
export declare function getActivationPolicy(siteConfigId: string): Promise<{
    id: string;
    tier: string;
    createdAt: Date;
    updatedAt: Date;
    siteConfigId: string;
    behaviorMinPct: number;
    frictionMinPct: number;
    minConfidence: number;
    requiredJourneys: string | null;
} | null>;
/** Create or update the activation policy for a site. */
export declare function upsertActivationPolicy(siteConfigId: string, data: Partial<{
    behaviorMinPct: number;
    frictionMinPct: number;
    minConfidence: number;
    requiredJourneys: string;
    tier: string;
}>): Promise<{
    id: string;
    tier: string;
    createdAt: Date;
    updatedAt: Date;
    siteConfigId: string;
    behaviorMinPct: number;
    frictionMinPct: number;
    minConfidence: number;
    requiredJourneys: string | null;
}>;
//# sourceMappingURL=site-config.repo.d.ts.map