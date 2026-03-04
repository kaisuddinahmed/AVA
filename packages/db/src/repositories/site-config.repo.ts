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

/** Create or update site config (upsert by siteUrl). */
export async function upsertSiteConfig(data: {
  siteUrl: string;
  platform: string;
  trackingConfig: string;
}) {
  return prisma.siteConfig.upsert({
    where: { siteUrl: data.siteUrl },
    create: data,
    update: {
      platform: data.platform,
      trackingConfig: data.trackingConfig,
    },
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
 * exist. Always rotates to a new key so the wizard can re-generate.
 */
export async function generateSiteKeyForSite(siteUrl: string) {
  const key = "avak_" + randomBytes(8).toString("hex");
  return prisma.siteConfig.upsert({
    where: { siteUrl },
    create: {
      siteUrl,
      siteKey: key,
      platform: "custom",
      trackingConfig: JSON.stringify({}),
      integrationStatus: "pending",
    },
    update: { siteKey: key },
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
  return prisma.activationPolicy.upsert({
    where: { siteConfigId },
    create: { siteConfigId, ...data },
    update: data,
  });
}
