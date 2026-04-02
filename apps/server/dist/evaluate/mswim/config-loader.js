import { ScoringConfigRepo } from "@ava/db";
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_GATES } from "@ava/shared";
import { logger } from "../../logger.js";
const log = logger.child({ service: "mswim" });
// In-memory cache with 60-second TTL
// Cache key: `${siteUrl ?? "global"}:${configId ?? "active"}`
const configCache = new Map();
const CACHE_TTL_MS = 60_000;
/**
 * Load the MSWIM config for a site. Falls back to global default,
 * then to hardcoded defaults. Cached for 60 seconds.
 *
 * @param siteUrl     Site-specific config lookup
 * @param scoringConfigId  Optional: load a specific ScoringConfig by ID
 *                         (used by experiment variants to override the active config)
 */
export async function loadMSWIMConfig(siteUrl, scoringConfigId) {
    const now = Date.now();
    const cacheKey = `${siteUrl ?? "global"}:${scoringConfigId ?? "active"}`;
    // Return cached if still valid
    const cached = configCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.config;
    }
    try {
        let dbConfig;
        if (scoringConfigId) {
            // Load specific config by ID (experiment variant override)
            dbConfig = await ScoringConfigRepo.getScoringConfig(scoringConfigId);
        }
        else {
            // Load active config for site (default behavior)
            dbConfig = await ScoringConfigRepo.getActiveConfig(siteUrl);
        }
        let mswimConfig;
        if (dbConfig) {
            const weights = {
                intent: dbConfig.weightIntent,
                friction: dbConfig.weightFriction,
                clarity: dbConfig.weightClarity,
                receptivity: dbConfig.weightReceptivity,
                value: dbConfig.weightValue,
            };
            const thresholds = {
                monitor: dbConfig.thresholdMonitor,
                passive: dbConfig.thresholdPassive,
                nudge: dbConfig.thresholdNudge,
                active: dbConfig.thresholdActive,
            };
            const gates = {
                minSessionAgeSec: dbConfig.minSessionAgeSec,
                maxActivePerSession: dbConfig.maxActivePerSession,
                maxNudgePerSession: dbConfig.maxNudgePerSession,
                maxNonPassivePerSession: dbConfig.maxNonPassivePerSession,
                cooldownAfterActiveSec: dbConfig.cooldownAfterActiveSec,
                cooldownAfterNudgeSec: dbConfig.cooldownAfterNudgeSec,
                cooldownAfterDismissSec: dbConfig.cooldownAfterDismissSec,
                dismissalsToSuppress: dbConfig.dismissalsToSuppress,
            };
            mswimConfig = { weights, thresholds, gates };
        }
        else {
            // Fallback to hardcoded defaults
            mswimConfig = {
                weights: { ...DEFAULT_WEIGHTS },
                thresholds: { ...DEFAULT_THRESHOLDS },
                gates: { ...DEFAULT_GATES },
            };
        }
        configCache.set(cacheKey, { config: mswimConfig, timestamp: now });
        return mswimConfig;
    }
    catch (error) {
        log.error("[MSWIM] Failed to load config from DB, using defaults:", error);
        const fallback = {
            weights: { ...DEFAULT_WEIGHTS },
            thresholds: { ...DEFAULT_THRESHOLDS },
            gates: { ...DEFAULT_GATES },
        };
        configCache.set(cacheKey, { config: fallback, timestamp: now });
        return fallback;
    }
}
/**
 * Invalidate the cached config (e.g., after admin updates weights).
 */
export function invalidateConfigCache() {
    configCache.clear();
}
//# sourceMappingURL=config-loader.js.map