import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { AnalyzerRunRepo, IntegrationStatusRepo, SessionRepo, SiteConfigRepo, } from "@ava/db";
import { generateHooks } from "../site-analyzer/hook-generator.js";
import { FULL_ACTIVE_THRESHOLDS, verifyIntegrationReadiness, } from "../onboarding/integration-verifier.js";
import { runAnalyzerPipeline } from "../onboarding/analyzer-runner.js";
import { IntegrationActivateSchema, IntegrationVerifySchema, } from "../validation/schemas.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
const __dirname = fileURLToPath(new URL(".", import.meta.url));
/**
 * POST /api/integration/generate
 * Body: { siteUrl: string }
 * Creates or updates a SiteConfig with a fresh siteKey (avak_<hex>) and returns
 * the installation snippet so the wizard can display the embed code immediately.
 */
export async function generateIntegration(req, res) {
    try {
        const { siteUrl } = req.body ?? {};
        if (!siteUrl || typeof siteUrl !== "string") {
            res.status(400).json({ error: "siteUrl is required" });
            return;
        }
        const normalised = normalizeSiteUrl(siteUrl);
        const site = await SiteConfigRepo.generateSiteKeyForSite(normalised);
        // Ensure a default ActivationPolicy exists for this site
        await SiteConfigRepo.upsertActivationPolicy(site.id, {});
        const scriptUrl = `${getServerBaseUrl(req)}/api/widget.js`;
        res.json({
            siteId: site.id,
            siteUrl: site.siteUrl,
            siteKey: site.siteKey,
            scriptUrl,
        });
    }
    catch (error) {
        log.error("[API] generateIntegration error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /api/integration/:siteKey/install-status
 * Polls whether the AVA widget has been installed and is actively sending
 * events. Identified by siteKey (avak_<hex>) so the wizard doesn't need to
 * pass the siteUrl in a query param — the key is enough to look up the site.
 *
 * Status values (3-state):
 *   "not_found"       — no site for this siteKey, or site exists but 0 sessions
 *   "found_unverified"— sessions exist (1-2, low confidence — tag may have just loaded)
 *   "verified_ready"  — 3+ sessions or any session with meaningful events; widget confirmed
 */
export async function getInstallStatus(req, res) {
    try {
        const siteKeyFromPath = readParam(req.params.siteKey);
        const siteKeyFromQuery = typeof req.query.siteKey === "string" ? req.query.siteKey.trim() : "";
        const siteUrlFromQuery = typeof req.query.siteUrl === "string" ? normalizeSiteUrl(req.query.siteUrl) : "";
        const siteKey = siteKeyFromPath || siteKeyFromQuery;
        if (!siteKey && !siteUrlFromQuery) {
            res.status(400).json({ error: "siteKey or siteUrl is required" });
            return;
        }
        // Resolve by siteKey first, then fallback to siteUrl
        const site = siteKey
            ? await SiteConfigRepo.getSiteConfigBySiteKey(siteKey)
            : await SiteConfigRepo.getSiteConfigByUrl(siteUrlFromQuery);
        if (!site) {
            res.json({ status: "not_found", detected: false, sessionCount: 0, platform: null, siteId: null });
            return;
        }
        // Runtime signal: active sessions from this site URL
        const sessions = await SessionRepo.listActiveSessions();
        const sessionCount = sessions.filter((s) => isSameSiteUrl(s.siteUrl, site.siteUrl)).length;
        // Static signal: install snippet present in target HTML
        const installSignal = await detectInstallSignal(site.siteUrl, site.siteKey ?? undefined);
        let status;
        if (sessionCount >= 3 || installSignal.status === "verified_ready") {
            status = "verified_ready";
        }
        else if (sessionCount > 0 || installSignal.status === "found_unverified") {
            status = "found_unverified";
        }
        else {
            status = "not_found";
        }
        res.json({
            status,
            detected: status !== "not_found",
            sessionCount,
            installSignal: installSignal.status,
            installReason: installSignal.reason,
            platform: site.platform,
            siteId: site.id,
        });
    }
    catch (error) {
        log.error("[API] getInstallStatus error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /api/widget.js
 * Serves the built AVA widget IIFE bundle with CORS headers so any site can
 * load it via a <script src="..."> tag.
 */
export async function serveWidget(req, res) {
    try {
        // The widget is built to apps/widget/dist/ava-widget.iife.js and copied
        // to apps/store/ava-widget.iife.js. Try all known locations.
        // __dirname is apps/server/src/api (dev/tsx) or apps/server/dist/api (built).
        // In both cases ../../../.. resolves to the apps/ directory.
        const candidates = [
            join(__dirname, "../../../../apps/widget/dist/ava-widget.iife.js"), // from project root
            join(__dirname, "../../../store/ava-widget.iife.js"), // apps/store/ copy
            join(__dirname, "../../../../../../apps/widget/dist/ava-widget.iife.js"), // extra fallback
        ];
        let widgetJs = null;
        for (const p of candidates) {
            try {
                widgetJs = readFileSync(p, "utf-8");
                break;
            }
            catch {
                // try next
            }
        }
        if (!widgetJs) {
            res
                .status(404)
                .send("// AVA widget not built yet. Run: npm run build --workspace=@ava/widget");
            return;
        }
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.send(widgetJs);
    }
    catch (error) {
        log.error("[API] serveWidget error:", error);
        res.status(500).send("// Internal server error");
    }
}
/**
 * POST /api/integration/:siteId/verify
 * Re-runs verification for the latest analyzer run (or an explicit runId).
 */
export async function verifyIntegration(req, res) {
    try {
        const parsed = IntegrationVerifySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.issues,
            });
            return;
        }
        const siteId = readParam(req.params.siteId);
        if (!siteId) {
            res.status(400).json({ error: "siteId is required" });
            return;
        }
        const site = await SiteConfigRepo.getSiteConfig(siteId);
        if (!site) {
            res.status(404).json({ error: "Site config not found" });
            return;
        }
        // Load per-site thresholds (same source as activateIntegration for consistency)
        const verifyPolicy = await SiteConfigRepo.getActivationPolicy(siteId);
        const verifyThresholds = {
            behaviorCoveragePct: verifyPolicy?.behaviorMinPct ?? FULL_ACTIVE_THRESHOLDS.behaviorCoveragePct,
            frictionCoveragePct: verifyPolicy?.frictionMinPct ?? FULL_ACTIVE_THRESHOLDS.frictionCoveragePct,
            avgConfidence: verifyPolicy?.minConfidence ?? FULL_ACTIVE_THRESHOLDS.avgConfidence,
        };
        const run = parsed.data.runId
            ? await AnalyzerRunRepo.getAnalyzerRun(parsed.data.runId)
            : await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);
        if (!run || run.siteConfigId !== siteId) {
            res.status(404).json({ error: "Analyzer run not found for this site" });
            return;
        }
        const verification = await verifyIntegrationReadiness({
            analyzerRunId: run.id,
            siteConfigId: siteId,
            trackingHooks: parseTrackingHooks(site.trackingConfig, site.platform),
        });
        await Promise.all([
            AnalyzerRunRepo.updateAnalyzerRun(run.id, {
                phase: "verify",
                behaviorCoverage: verification.behaviorCoveragePct,
                frictionCoverage: verification.frictionCoveragePct,
                avgConfidence: verification.avgConfidence,
            }),
            IntegrationStatusRepo.createIntegrationStatus({
                siteConfigId: siteId,
                analyzerRunId: run.id,
                status: "verified",
                progress: 90,
                details: JSON.stringify({
                    phase: "verify",
                    verification,
                    thresholds: verifyThresholds,
                }),
            }),
        ]);
        res.json({
            siteId,
            runId: run.id,
            verification,
            thresholds: verifyThresholds,
            recommendedMode: verification.recommendedMode,
        });
    }
    catch (error) {
        log.error("[API] Verify integration error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * POST /api/integration/:siteId/activate
 * Activates a site as `active` or `limited_active`.
 */
export async function activateIntegration(req, res) {
    try {
        const parsed = IntegrationActivateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.issues,
            });
            return;
        }
        const siteId = readParam(req.params.siteId);
        if (!siteId) {
            res.status(400).json({ error: "siteId is required" });
            return;
        }
        const payload = parsed.data;
        const site = await SiteConfigRepo.getSiteConfig(siteId);
        if (!site) {
            res.status(404).json({ error: "Site config not found" });
            return;
        }
        // Load per-site activation thresholds from DB, falling back to defaults
        const policy = await SiteConfigRepo.getActivationPolicy(siteId);
        const thresholds = {
            behaviorCoveragePct: policy?.behaviorMinPct ?? FULL_ACTIVE_THRESHOLDS.behaviorCoveragePct,
            frictionCoveragePct: policy?.frictionMinPct ?? FULL_ACTIVE_THRESHOLDS.frictionCoveragePct,
            avgConfidence: policy?.minConfidence ?? FULL_ACTIVE_THRESHOLDS.avgConfidence,
        };
        let latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);
        // Auto-bootstrap: if no analyzer run exists, create one and run the pipeline
        // so FrictionMapping + BehaviorPatternMapping rows are populated before gate checks.
        if (!latestRun) {
            log.info("[API] No analyzer run found for site %s — bootstrapping pipeline", siteId);
            const bootstrapRun = await AnalyzerRunRepo.createAnalyzerRun({
                siteConfigId: siteId,
                status: "pending",
                phase: "bootstrap",
            });
            try {
                await runAnalyzerPipeline(bootstrapRun.id);
            }
            catch (pipelineErr) {
                log.warn("[API] Bootstrap pipeline error (non-fatal):", pipelineErr);
            }
            latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);
        }
        const verification = latestRun
            ? await verifyIntegrationReadiness({
                analyzerRunId: latestRun.id,
                siteConfigId: siteId,
                trackingHooks: parseTrackingHooks(site.trackingConfig, site.platform),
            })
            : null;
        const gates = {
            behaviorCoverage: (verification?.behaviorCoveragePct ?? 0) >= thresholds.behaviorCoveragePct,
            frictionCoverage: (verification?.frictionCoveragePct ?? 0) >= thresholds.frictionCoveragePct,
            avgConfidence: (verification?.avgConfidence ?? 0) >= thresholds.avgConfidence,
            criticalJourneys: verification?.criticalJourneysPassed ?? payload.criticalJourneysPassed,
        };
        const canBeFullyActive = gates.behaviorCoverage &&
            gates.frictionCoverage &&
            gates.avgConfidence &&
            gates.criticalJourneys;
        let mode;
        if (payload.mode === "active") {
            if (!canBeFullyActive) {
                res.status(400).json({
                    error: "Cannot activate in full mode. Thresholds not met; use limited_active or mode=auto.",
                    gates,
                    thresholds,
                });
                return;
            }
            mode = "active";
        }
        else if (payload.mode === "limited_active") {
            mode = "limited_active";
        }
        else {
            mode = canBeFullyActive ? "active" : "limited_active";
        }
        if (latestRun && latestRun.status !== "failed") {
            await AnalyzerRunRepo.completeAnalyzerRun(latestRun.id, {
                phase: "activate",
                ...(verification
                    ? {
                        behaviorCoverage: verification.behaviorCoveragePct,
                        frictionCoverage: verification.frictionCoveragePct,
                        avgConfidence: verification.avgConfidence,
                    }
                    : {}),
            });
        }
        await Promise.all([
            SiteConfigRepo.setIntegrationStatus(siteId, mode, latestRun?.id ?? null),
            IntegrationStatusRepo.createIntegrationStatus({
                siteConfigId: siteId,
                analyzerRunId: latestRun?.id,
                status: mode,
                progress: mode === "active" ? 100 : 85,
                details: JSON.stringify({
                    mode,
                    gates,
                    thresholds,
                    verification,
                    notes: payload.notes,
                }),
            }),
        ]);
        res.json({
            siteId,
            mode,
            gates,
            thresholds,
            verification,
            runId: latestRun?.id ?? null,
        });
    }
    catch (error) {
        log.error("[API] Activate integration error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * POST /api/site/reset?siteUrl=...
 * Resets a site's integration status back to "analyzing" (dormant).
 * Called by the demo wizard on startup so every demo session starts with the widget dormant.
 */
export async function resetSiteStatus(req, res) {
    const siteUrl = typeof req.query.siteUrl === "string" ? normalizeSiteUrl(req.query.siteUrl) : null;
    if (!siteUrl) {
        res.status(400).json({ error: "siteUrl query param is required" });
        return;
    }
    try {
        const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
        if (!site) {
            res.json({ status: "unknown", reset: false });
            return;
        }
        await SiteConfigRepo.setIntegrationStatus(site.id, "analyzing", null);
        res.json({ status: "analyzing", reset: true });
    }
    catch (error) {
        log.error("[API] resetSiteStatus error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /api/site/status?siteUrl=...&siteKey=<optional>
 * Lightweight endpoint called by the widget on init to check if this site is activated.
 * Returns { status, activated } — no auth needed, read-only.
 *
 * When siteKey is present the server validates that it belongs to the given siteUrl.
 * A mismatched key is treated as an unactivated site (prevents siteUrl spoofing).
 */
export async function getSiteStatus(req, res) {
    const siteUrl = typeof req.query.siteUrl === "string" ? normalizeSiteUrl(req.query.siteUrl) : null;
    if (!siteUrl) {
        res.status(400).json({ error: "siteUrl query param is required" });
        return;
    }
    // Extract siteKey early — needed for fallback lookup below
    const incomingSiteKey = typeof req.query.siteKey === "string" ? req.query.siteKey : null;
    try {
        // Primary lookup: exact siteUrl match
        let site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
        // Fallback: exact URL match failed but widget provided a siteKey.
        // This handles localhost port mismatches — e.g. wizard stored "http://localhost"
        // (no port) while the store widget reports "http://localhost:3001" (with port).
        // isSameSiteUrl() treats any port-difference on localhost as the same host.
        if (!site && incomingSiteKey) {
            const siteByKey = await SiteConfigRepo.getSiteConfigBySiteKey(incomingSiteKey);
            if (siteByKey && isSameSiteUrl(siteByKey.siteUrl, siteUrl)) {
                site = siteByKey;
            }
        }
        if (!site) {
            // Unknown site — respond with unactivated so widget stays dormant
            res.json({ status: "unknown", activated: false });
            return;
        }
        // Validate siteKey when the widget provides one (prevents siteUrl spoofing)
        if (incomingSiteKey && site.siteKey && incomingSiteKey !== site.siteKey) {
            // Key mismatch — stale snippet or spoofing attempt; stay dormant
            res.json({ status: "key_mismatch", activated: false });
            return;
        }
        const activated = site.integrationStatus === "active" ||
            site.integrationStatus === "limited_active";
        res.json({ status: site.integrationStatus, activated });
    }
    catch (error) {
        log.error("[API] getSiteStatus error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
function parseTrackingHooks(trackingConfig, platform) {
    try {
        const parsed = JSON.parse(trackingConfig);
        if (parsed?.selectors && parsed?.eventMappings) {
            return parsed;
        }
    }
    catch {
        // Fallback below.
    }
    return generateHooks(platform);
}
async function detectInstallSignal(siteUrl, expectedSiteKey) {
    try {
        const response = await fetch(siteUrl, {
            headers: { "User-Agent": "AVA-Install-Checker/1.0" },
            signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) {
            return { status: "not_found", reason: `fetch_${response.status}` };
        }
        const html = await response.text();
        const hasWidgetScript = /\/api\/widget\.js/i.test(html) || /ava-widget\.iife\.js/i.test(html);
        if (!hasWidgetScript) {
            return { status: "not_found", reason: "widget_script_missing" };
        }
        const keys = [...new Set([...html.matchAll(/avak_[a-f0-9]{16}/gi)].map((m) => m[0]))];
        if (expectedSiteKey && keys.includes(expectedSiteKey)) {
            return { status: "verified_ready", reason: "matching_site_key_detected" };
        }
        if (keys.length > 0) {
            return { status: "found_unverified", reason: "different_site_key_detected" };
        }
        return {
            status: expectedSiteKey ? "found_unverified" : "verified_ready",
            reason: expectedSiteKey ? "widget_detected_key_missing" : "widget_detected",
        };
    }
    catch {
        return { status: "not_found", reason: "fetch_failed" };
    }
}
function readParam(value) {
    if (Array.isArray(value))
        return value[0] ?? "";
    return value ?? "";
}
function normalizeSiteUrl(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return "";
    try {
        const parsed = new URL(trimmed);
        return parsed.origin;
    }
    catch {
        return trimmed.replace(/\/$/, "");
    }
}
function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function isSameSiteUrl(a, b) {
    const left = normalizeSiteUrl(a);
    const right = normalizeSiteUrl(b);
    if (!left || !right)
        return false;
    if (left === right)
        return true;
    try {
        const leftUrl = new URL(left);
        const rightUrl = new URL(right);
        const bothLocal = isLocalHost(leftUrl.hostname) && isLocalHost(rightUrl.hostname);
        if (!bothLocal || leftUrl.protocol !== rightUrl.protocol)
            return false;
        const onePortMissing = !leftUrl.port || !rightUrl.port;
        return onePortMissing;
    }
    catch {
        return false;
    }
}
/** Derive the server's own base URL from the incoming request (for snippet generation). */
function getServerBaseUrl(req) {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:8080";
    return `${proto}://${host}`;
}
//# sourceMappingURL=integration.api.js.map