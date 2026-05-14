import { randomBytes } from "crypto";
import { prisma } from "../client.js";

// ============================================================================
// SiteConfig Repository — per-site tracking & platform configuration
// ============================================================================

/** Get site config by URL. */
export async function getSiteConfigByUrl(siteUrl: string) {
  return prisma.siteConfig.findUnique({ where: { siteUrl } });
}

/** Get site config by ID. */
export async function getSiteConfig(id: string) {
  return prisma.siteConfig.findUnique({ where: { id } });
}

/** List all site configs. */
export async function listSiteConfigs() {
  return prisma.siteConfig.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Return the siteUrl of every site that has opted in to the network flywheel.
 * Used by the cross-merchant aggregation job (Story 10).
 */
export async function listOptedInSiteUrls(): Promise<string[]> {
  const rows = await prisma.siteConfig.findMany({
    where: { networkOptIn: true },
    select: { siteUrl: true },
  });
  return rows.map((r) => r.siteUrl);
}

/** Create or update site config (upsert by siteUrl). */
export async function upsertSiteConfig(data: {
  siteUrl: string;
  platform: string;
  trackingConfig: string;
}) {
  return (prisma as any).siteConfig.upsert({
    where: { siteUrl: data.siteUrl },
    update: { platform: data.platform, trackingConfig: data.trackingConfig },
    create: data,
  });
}

/** Create a new site config. */
export async function createSiteConfig(data: {
  siteUrl: string;
  platform: string;
  trackingConfig: string;
}) {
  return prisma.siteConfig.create({ data });
}

/** Update an existing site config. */
export async function updateSiteConfig(
  id: string,
  data: Partial<{
    platform: string;
    trackingConfig: string;
    integrationStatus: string;
    activeAnalyzerRunId: string | null;
  }>,
) {
  return prisma.siteConfig.update({ where: { id }, data: data as any });
}

/** Delete a site config. */
export async function deleteSiteConfig(id: string) {
  return prisma.siteConfig.delete({ where: { id } });
}

/**
 * Set the session-exit webhook URL and/or secret for a site.
 * Either field may be omitted to leave the existing value unchanged.
 */
export async function setWebhookConfig(
  id: string,
  data: { webhookUrl?: string; webhookSecret?: string },
) {
  return prisma.siteConfig.update({
    where: { id },
    data: {
      ...(data.webhookUrl !== undefined ? { webhookUrl: data.webhookUrl } : {}),
      ...(data.webhookSecret !== undefined ? { webhookSecret: data.webhookSecret } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Shopify integration (Story 11)
// ---------------------------------------------------------------------------

/**
 * Install or update a Shopify site config. Uses the two-call find-then-create
 * pattern instead of upsert because the Prisma WASM engine crashes on upsert
 * with the node:sqlite adapter.
 */
export async function installShopify(data: {
  siteUrl: string;
  shop: string;
  accessToken: string;
  integrationStatus?: string;
}) {
  const integrationStatus = data.integrationStatus ?? "limited_active";
  const existing = await prisma.siteConfig.findUnique({ where: { siteUrl: data.siteUrl } });
  if (existing) {
    return prisma.siteConfig.update({
      where: { siteUrl: data.siteUrl },
      data: {
        shopifyShop: data.shop,
        shopifyAccessToken: data.accessToken,
        integrationStatus,
      },
    });
  }
  return prisma.siteConfig.create({
    data: {
      siteUrl: data.siteUrl,
      platform: "shopify",
      trackingConfig: JSON.stringify({ shopify: true }),
      integrationStatus,
      shopifyShop: data.shop,
      shopifyAccessToken: data.accessToken,
    },
  });
}

/** Record the ScriptTag resource id returned by Shopify after widget injection. */
export async function setShopifyScriptTagId(siteUrl: string, scriptTagId: number) {
  return prisma.siteConfig.update({
    where: { siteUrl },
    data: { shopifyScriptTagId: scriptTagId },
  });
}

/**
 * Called from the Shopify app-uninstall webhook. Clears Shopify credentials
 * but retains the SiteConfig row (so history/analytics survive a reinstall).
 */
export async function clearShopifyCredentials(siteUrl: string) {
  return prisma.siteConfig.update({
    where: { siteUrl },
    data: {
      shopifyAccessToken: null,
      shopifyScriptTagId: null,
      integrationStatus: "pending",
    },
  });
}

/**
 * GDPR shop/redact — mark the site as deleted. Full data purge runs from the
 * nightly cleanup job. Uses updateMany to silently no-op if the siteUrl doesn't
 * exist (Shopify retries this webhook).
 */
export async function markIntegrationDeletedBySiteUrl(siteUrl: string) {
  return prisma.siteConfig.updateMany({
    where: { siteUrl },
    data: { integrationStatus: "deleted" },
  });
}

/** Toggle a site's opt-in to the cross-merchant network flywheel (Story 10). */
export async function setNetworkOptIn(id: string, optIn: boolean) {
  return prisma.siteConfig.update({
    where: { id },
    data: { networkOptIn: optIn },
  });
}

/** Update site integration status and optionally the active analyzer run. */
export async function setIntegrationStatus(
  id: string,
  integrationStatus: string,
  activeAnalyzerRunId?: string | null,
) {
  return prisma.siteConfig.update({
    where: { id },
    data: {
      integrationStatus,
      ...(activeAnalyzerRunId !== undefined ? { activeAnalyzerRunId } : {}),
    } as any,
  });
}

/** Set or clear active analyzer run pointer for a site. */
export async function setActiveAnalyzerRun(
  id: string,
  activeAnalyzerRunId: string | null,
) {
  return prisma.siteConfig.update({
    where: { id },
    data: { activeAnalyzerRunId } as any,
  });
}

/** Get tracking config (parsed JSON) for a site URL. */
export async function getTrackingConfig(
  siteUrl: string,
): Promise<Record<string, unknown> | null> {
  const config = await prisma.siteConfig.findUnique({
    where: { siteUrl },
    select: { trackingConfig: true },
  });
  if (!config) return null;
  try {
    return JSON.parse(config.trackingConfig);
  } catch {
    return null;
  }
}

/** Get site config by siteKey (avak_<hex>). */
export async function getSiteConfigBySiteKey(siteKey: string) {
  return prisma.siteConfig.findUnique({ where: { siteKey } });
}

/**
 * Generate a fresh siteKey for a site, creating the SiteConfig if it doesn't
 * exist. Existing site keys are preserved so repeated "Generate" calls do not
 * invalidate an already-installed snippet.
 */
export async function generateSiteKeyForSite(siteUrl: string) {
  const existing = await prisma.siteConfig.findUnique({ where: { siteUrl } });
  const key = existing?.siteKey || ("avak_" + randomBytes(8).toString("hex"));
  if (existing) {
    return existing.siteKey
      ? existing
      : prisma.siteConfig.update({ where: { siteUrl }, data: { siteKey: key } });
  }
  return prisma.siteConfig.create({
    data: {
      siteUrl,
      siteKey: key,
      platform: "custom",
      trackingConfig: JSON.stringify({}),
      integrationStatus: "pending",
    },
  });
}

// ---------------------------------------------------------------------------
// ActivationPolicy helpers
// ---------------------------------------------------------------------------

/** Get the activation policy for a site (returns null if not set → caller uses defaults). */
export async function getActivationPolicy(siteConfigId: string) {
  return prisma.activationPolicy.findUnique({ where: { siteConfigId } });
}

/** Create or update the activation policy for a site. */
export async function upsertActivationPolicy(
  siteConfigId: string,
  data: Partial<{
    behaviorMinPct: number;
    frictionMinPct: number;
    minConfidence: number;
    requiredJourneys: string;
    tier: string;
  }>,
) {
  return (prisma as any).activationPolicy.upsert({
    where: { siteConfigId },
    update: data,
    create: { siteConfigId, ...data },
  });
}
