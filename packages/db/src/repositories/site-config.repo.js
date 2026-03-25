"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSiteConfigByUrl = getSiteConfigByUrl;
exports.getSiteConfig = getSiteConfig;
exports.listSiteConfigs = listSiteConfigs;
exports.upsertSiteConfig = upsertSiteConfig;
exports.createSiteConfig = createSiteConfig;
exports.updateSiteConfig = updateSiteConfig;
exports.deleteSiteConfig = deleteSiteConfig;
exports.setIntegrationStatus = setIntegrationStatus;
exports.setActiveAnalyzerRun = setActiveAnalyzerRun;
exports.getTrackingConfig = getTrackingConfig;
exports.getSiteConfigBySiteKey = getSiteConfigBySiteKey;
exports.generateSiteKeyForSite = generateSiteKeyForSite;
exports.getActivationPolicy = getActivationPolicy;
exports.upsertActivationPolicy = upsertActivationPolicy;
const crypto_1 = require("crypto");
const client_js_1 = require("../client.js");
// ============================================================================
// SiteConfig Repository — per-site tracking & platform configuration
// ============================================================================
/** Get site config by URL. */
async function getSiteConfigByUrl(siteUrl) {
    return client_js_1.prisma.siteConfig.findUnique({ where: { siteUrl } });
}
/** Get site config by ID. */
async function getSiteConfig(id) {
    return client_js_1.prisma.siteConfig.findUnique({ where: { id } });
}
/** List all site configs. */
async function listSiteConfigs() {
    return client_js_1.prisma.siteConfig.findMany({
        orderBy: { updatedAt: "desc" },
    });
}
/** Create or update site config (upsert by siteUrl). */
async function upsertSiteConfig(data) {
    return client_js_1.prisma.siteConfig.upsert({
        where: { siteUrl: data.siteUrl },
        create: data,
        update: {
            platform: data.platform,
            trackingConfig: data.trackingConfig,
        },
    });
}
/** Create a new site config. */
async function createSiteConfig(data) {
    return client_js_1.prisma.siteConfig.create({ data });
}
/** Update an existing site config. */
async function updateSiteConfig(id, data) {
    return client_js_1.prisma.siteConfig.update({ where: { id }, data: data });
}
/** Delete a site config. */
async function deleteSiteConfig(id) {
    return client_js_1.prisma.siteConfig.delete({ where: { id } });
}
/** Update site integration status and optionally the active analyzer run. */
async function setIntegrationStatus(id, integrationStatus, activeAnalyzerRunId) {
    return client_js_1.prisma.siteConfig.update({
        where: { id },
        data: {
            integrationStatus,
            ...(activeAnalyzerRunId !== undefined ? { activeAnalyzerRunId } : {}),
        },
    });
}
/** Set or clear active analyzer run pointer for a site. */
async function setActiveAnalyzerRun(id, activeAnalyzerRunId) {
    return client_js_1.prisma.siteConfig.update({
        where: { id },
        data: { activeAnalyzerRunId },
    });
}
/** Get tracking config (parsed JSON) for a site URL. */
async function getTrackingConfig(siteUrl) {
    const config = await client_js_1.prisma.siteConfig.findUnique({
        where: { siteUrl },
        select: { trackingConfig: true },
    });
    if (!config)
        return null;
    try {
        return JSON.parse(config.trackingConfig);
    }
    catch {
        return null;
    }
}
/** Get site config by siteKey (avak_<hex>). */
async function getSiteConfigBySiteKey(siteKey) {
    return client_js_1.prisma.siteConfig.findUnique({ where: { siteKey } });
}
/**
 * Generate a fresh siteKey for a site, creating the SiteConfig if it doesn't
 * exist. Existing site keys are preserved so repeated "Generate" calls do not
 * invalidate an already-installed snippet.
 */
async function generateSiteKeyForSite(siteUrl) {
    const existing = await client_js_1.prisma.siteConfig.findUnique({
        where: { siteUrl },
        select: { siteKey: true },
    });
    const key = existing?.siteKey || ("avak_" + (0, crypto_1.randomBytes)(8).toString("hex"));
    return client_js_1.prisma.siteConfig.upsert({
        where: { siteUrl },
        create: {
            siteUrl,
            siteKey: key,
            platform: "custom",
            trackingConfig: JSON.stringify({}),
            integrationStatus: "pending",
        },
        update: existing?.siteKey ? {} : { siteKey: key },
    });
}
// ---------------------------------------------------------------------------
// ActivationPolicy helpers
// ---------------------------------------------------------------------------
/** Get the activation policy for a site (returns null if not set → caller uses defaults). */
async function getActivationPolicy(siteConfigId) {
    return client_js_1.prisma.activationPolicy.findUnique({ where: { siteConfigId } });
}
/** Create or update the activation policy for a site. */
async function upsertActivationPolicy(siteConfigId, data) {
    return client_js_1.prisma.activationPolicy.upsert({
        where: { siteConfigId },
        create: { siteConfigId, ...data },
        update: data,
    });
}
//# sourceMappingURL=site-config.repo.js.map