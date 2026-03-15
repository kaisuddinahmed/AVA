import type { Request, Response } from "express";
import { SiteConfigRepo, NetworkPatternRepo } from "@ava/db";

// ---------------------------------------------------------------------------
// GET /api/network/status?siteUrl=
// Returns network opt-in status, contribution size, and total network patterns.
// ---------------------------------------------------------------------------

export async function getNetworkStatus(req: Request, res: Response) {
  const siteUrl = req.query.siteUrl as string | undefined;

  const totalPatterns = await NetworkPatternRepo.countNetworkPatterns();

  if (!siteUrl) {
    return res.json({ totalPatterns, site: null });
  }

  const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl).catch(() => null);
  if (!site) {
    return res.json({ totalPatterns, site: null });
  }

  // Estimate contribution: count distinct frictions from this site's sessions in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { prisma } = await import("@ava/db");
  const sessionCount = await prisma.session.count({
    where: { siteUrl, startedAt: { gte: thirtyDaysAgo } },
  });

  return res.json({
    totalPatterns,
    site: {
      siteUrl,
      networkOptIn: site.networkOptIn,
      contributionSessions: sessionCount,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/network/opt-in
// Toggle network opt-in for a site.
// ---------------------------------------------------------------------------

export async function updateNetworkOptIn(req: Request, res: Response) {
  const { siteUrl, optIn } = req.body as { siteUrl: string; optIn: boolean };
  if (!siteUrl || typeof optIn !== "boolean") {
    return res.status(400).json({ error: "siteUrl and optIn required" });
  }
  const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl).catch(() => null);
  if (!site) return res.status(404).json({ error: "site not found" });

  const { prisma } = await import("@ava/db");
  await prisma.siteConfig.update({
    where: { id: site.id },
    data: { networkOptIn: optIn },
  });

  return res.json({ ok: true, networkOptIn: optIn });
}
