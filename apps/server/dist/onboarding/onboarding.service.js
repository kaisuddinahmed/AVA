import { AnalyzerRunRepo, IntegrationStatusRepo, SiteConfigRepo, } from "@ava/db";
import { analyzeSite, reanalyzeSite } from "../site-analyzer/analyzer.service.js";
import { runAnalyzerPipeline } from "./analyzer-runner.js";
import { broadcastOnboardingProgress } from "./progress-broadcaster.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "onboarding" });
const runningRuns = new Set();
export async function startOnboardingRun(payload) {
    let siteConfig = payload.siteId
        ? await SiteConfigRepo.getSiteConfig(payload.siteId)
        : null;
    if (!siteConfig && payload.siteUrl) {
        // Fetch the site's HTML if the caller did not provide it.
        // A best-effort request — we continue without it if the fetch fails.
        let html = payload.html;
        if (!html) {
            try {
                const response = await fetch(payload.siteUrl, {
                    headers: { "User-Agent": "AVA-Analyzer/1.0 (site analysis bot)" },
                    signal: AbortSignal.timeout(10_000),
                });
                if (response.ok) {
                    html = await response.text();
                    log.info(`[Onboarding] Fetched ${html.length} chars from ${payload.siteUrl}`);
                }
            }
            catch (fetchErr) {
                log.warn(`[Onboarding] Could not fetch ${payload.siteUrl}:`, fetchErr);
            }
        }
        if (payload.forceReanalyze && html) {
            await reanalyzeSite(payload.siteUrl, html);
        }
        else {
            await analyzeSite(payload.siteUrl, html);
        }
        siteConfig = await SiteConfigRepo.getSiteConfigByUrl(payload.siteUrl);
    }
    // Fallback path: explicit upsert if analyzer did not produce a config.
    if (!siteConfig && payload.siteUrl) {
        siteConfig = await SiteConfigRepo.upsertSiteConfig({
            siteUrl: payload.siteUrl,
            platform: payload.platform ?? "custom",
            trackingConfig: JSON.stringify(payload.trackingConfig ?? {}),
        });
    }
    if (!siteConfig) {
        throw new Error("Site config not found");
    }
    const latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteConfig.id);
    if (latestRun && latestRun.status === "running") {
        return {
            runId: latestRun.id,
            siteId: siteConfig.id,
            status: latestRun.status,
            phase: latestRun.phase,
        };
    }
    const run = await AnalyzerRunRepo.createAnalyzerRun({
        siteConfigId: siteConfig.id,
        status: "queued",
        phase: "detect_platform",
    });
    await Promise.all([
        SiteConfigRepo.setIntegrationStatus(siteConfig.id, "analyzing", run.id),
        IntegrationStatusRepo.createIntegrationStatus({
            siteConfigId: siteConfig.id,
            analyzerRunId: run.id,
            status: "analyzing",
            progress: 10,
            details: JSON.stringify({
                phase: "detect_platform",
                message: "Onboarding run started",
                startedAt: run.startedAt.toISOString(),
            }),
        }),
    ]);
    broadcastOnboardingProgress({
        siteConfigId: siteConfig.id,
        analyzerRunId: run.id,
        status: "analyzing",
        progress: 10,
        details: {
            phase: "detect_platform",
            message: "Onboarding run started",
            startedAt: run.startedAt.toISOString(),
        },
    });
    triggerAnalyzer(run.id);
    return {
        runId: run.id,
        siteId: siteConfig.id,
        status: run.status,
        phase: run.phase,
    };
}
function triggerAnalyzer(runId) {
    if (runningRuns.has(runId))
        return;
    runningRuns.add(runId);
    void runAnalyzerPipeline(runId)
        .catch((error) => {
        log.error(`[Onboarding] Analyzer pipeline failed for ${runId}:`, error);
    })
        .finally(() => {
        runningRuns.delete(runId);
    });
}
//# sourceMappingURL=onboarding.service.js.map