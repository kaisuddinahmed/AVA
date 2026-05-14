import { SessionRepo, SiteConfigRepo, NetworkPatternRepo } from "@ava/db";
// ---------------------------------------------------------------------------
// GET /api/network/status?siteUrl=
// Returns network opt-in status, contribution size, and total network patterns.
// ---------------------------------------------------------------------------
export async function getNetworkStatus(req, res) {
    const siteUrl = req.query.siteUrl;
    const totalPatterns = await NetworkPatternRepo.countNetworkPatterns();
    if (!siteUrl) {
        return res.json({ totalPatterns, site: null });
    }
    const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl).catch(() => null);
    if (!site) {
        return res.json({ totalPatterns, site: null });
    }
    // Estimate contribution: sessions from this site in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sessionCount = await SessionRepo.countByPeriod(siteUrl, thirtyDaysAgo);
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
export async function updateNetworkOptIn(req, res) {
    const { siteUrl, optIn } = req.body;
    if (!siteUrl || typeof optIn !== "boolean") {
        return res.status(400).json({ error: "siteUrl and optIn required" });
    }
    const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl).catch(() => null);
    if (!site)
        return res.status(404).json({ error: "site not found" });
    await SiteConfigRepo.setNetworkOptIn(site.id, optIn);
    return res.json({ ok: true, networkOptIn: optIn });
}
//# sourceMappingURL=network.api.js.map