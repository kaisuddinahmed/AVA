import type { MSWIMConfig } from "@ava/shared";
/**
 * Load the MSWIM config for a site. Falls back to global default,
 * then to hardcoded defaults. Cached for 60 seconds.
 *
 * @param siteUrl     Site-specific config lookup
 * @param scoringConfigId  Optional: load a specific ScoringConfig by ID
 *                         (used by experiment variants to override the active config)
 */
export declare function loadMSWIMConfig(siteUrl?: string, scoringConfigId?: string): Promise<MSWIMConfig>;
/**
 * Invalidate the cached config (e.g., after admin updates weights).
 */
export declare function invalidateConfigCache(): void;
//# sourceMappingURL=config-loader.d.ts.map