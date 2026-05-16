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

// ---------------------------------------------------------------------------
// Phase 1.5.5 — Baseline lifecycle (split from comparison)
// ---------------------------------------------------------------------------

/**
 * Promote the current fingerprintHash + selectors to the baseline columns.
 * Called once per (siteUrl, pageType) after a successful ingest, so the
 * comparison service has a trusted reference.
 *
 * Re-running this OVERWRITES the baseline — caller decides when that's safe
 * (e.g., merchant explicitly reconfirms layout after a redesign).
 */
export async function markAsBaseline(siteUrl: string, pageType: string) {
  const existing = await prisma.siteSelectorFingerprint.findUnique({
    where: { siteUrl_pageType: { siteUrl, pageType } },
  });
  if (!existing) return null;
  return prisma.siteSelectorFingerprint.update({
    where: { siteUrl_pageType: { siteUrl, pageType } },
    data: {
      baselineHash: existing.fingerprintHash,
      baselineSelectors: existing.selectors,
      baselineCapturedAt: new Date(),
    },
  });
}

/** Returns true when (siteUrl, pageType) already has a baseline captured. */
export async function hasBaseline(siteUrl: string, pageType: string): Promise<boolean> {
  const row = await prisma.siteSelectorFingerprint.findUnique({
    where: { siteUrl_pageType: { siteUrl, pageType } },
    select: { baselineHash: true },
  });
  return Boolean(row?.baselineHash);
}

/** Every fingerprint row for a site — used by the comparison service. */
export async function listForSite(siteUrl: string) {
  return prisma.siteSelectorFingerprint.findMany({
    where: { siteUrl },
    orderBy: { pageType: "asc" },
  });
}

/** Every site that has at least one baseline captured — drives the nightly check. */
export async function listSitesWithBaselines(): Promise<string[]> {
  const rows = await prisma.siteSelectorFingerprint.findMany({
    where: { baselineHash: { not: null } },
    select: { siteUrl: true },
    distinct: ["siteUrl"],
  });
  return rows.map((r) => r.siteUrl);
}
