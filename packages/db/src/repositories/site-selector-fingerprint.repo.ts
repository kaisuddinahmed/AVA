// ============================================================================
// SiteSelectorFingerprint Repository — DOM fingerprint baselines used by the
// drift healer (Phase 1). Compares current widget-load fingerprint against
// stored baseline; if hash differs and similarity is below threshold, raises
// a `SelectorDrift` alert and triggers the LLM DOM mapper.
// ============================================================================

import { prisma } from "../client.js";

export type UpsertFingerprintInput = {
  siteUrl: string;
  pageType: string;
  fingerprintHash: string;
  fingerprintData: string;  // JSON
  selectors: string;        // JSON
};

/** Insert or update the baseline for (siteUrl, pageType). */
export async function upsertFingerprint(data: UpsertFingerprintInput) {
  return prisma.siteSelectorFingerprint.upsert({
    where: { siteUrl_pageType: { siteUrl: data.siteUrl, pageType: data.pageType } },
    update: {
      fingerprintHash: data.fingerprintHash,
      fingerprintData: data.fingerprintData,
      selectors: data.selectors,
      lastCheckedAt: new Date(),
    },
    create: data,
  });
}

/** Fetch the baseline for a page type. */
export async function getBaseline(siteUrl: string, pageType: string) {
  return prisma.siteSelectorFingerprint.findUnique({
    where: { siteUrl_pageType: { siteUrl, pageType } },
  });
}

/** Record that drift was detected (increments counter, sets timestamp). */
export async function recordDrift(siteUrl: string, pageType: string) {
  return prisma.siteSelectorFingerprint.update({
    where: { siteUrl_pageType: { siteUrl, pageType } },
    data: {
      driftCount: { increment: 1 },
      lastDriftAt: new Date(),
    },
  });
}

/** List recent drift events across all sites (for the dashboard health card). */
export async function listRecentDrift(options?: { limit?: number }) {
  return prisma.siteSelectorFingerprint.findMany({
    where: { lastDriftAt: { not: null } },
    orderBy: { lastDriftAt: "desc" },
    take: options?.limit ?? 50,
  });
}
