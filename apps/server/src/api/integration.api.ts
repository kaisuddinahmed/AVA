import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import {
  AnalyzerRunRepo,
  IntegrationStatusRepo,
  SessionRepo,
  SiteConfigRepo,
} from "@ava/db";
import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
import { generateHooks } from "../site-analyzer/hook-generator.js";
import {
  FULL_ACTIVE_THRESHOLDS,
  verifyIntegrationReadiness,
} from "../onboarding/integration-verifier.js";
import {
  IntegrationActivateSchema,
  IntegrationVerifySchema,
} from "../validation/schemas.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * POST /api/integration/generate
 * Body: { siteUrl: string }
 * Creates or updates a SiteConfig with a fresh siteKey (avak_<hex>) and returns
 * the installation snippet so the wizard can display the embed code immediately.
 */
export async function generateIntegration(req: Request, res: Response) {
  try {
    const { siteUrl } = req.body ?? {};
    if (!siteUrl || typeof siteUrl !== "string") {
      res.status(400).json({ error: "siteUrl is required" });
      return;
    }

    const normalised = siteUrl.trim().replace(/\/$/, "");
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
  } catch (error) {
    console.error("[API] generateIntegration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/integration/install-status?siteUrl=...
 * Polls whether the AVA widget has been installed and is sending events from
 * the given siteUrl. Used by the wizard to detect tag installation.
 * Status values: "not_found" | "verified_ready"
 */
export async function getInstallStatus(req: Request, res: Response) {
  try {
    const siteUrl = typeof req.query.siteUrl === "string" ? req.query.siteUrl : null;
    if (!siteUrl) {
      res.status(400).json({ error: "siteUrl query param is required" });
      return;
    }

    // Check whether any live sessions exist from this siteUrl
    const sessions = await SessionRepo.listActiveSessions(siteUrl);
    const detected = sessions.length > 0;

    const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);

    res.json({
      status: detected ? "verified_ready" : "not_found",
      detected,
      sessionCount: sessions.length,
      platform: site?.platform ?? null,
      siteId: site?.id ?? null,
    });
  } catch (error) {
    console.error("[API] getInstallStatus error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/widget.js
 * Serves the built AVA widget IIFE bundle with CORS headers so any site can
 * load it via a <script src="..."> tag.
 */
export async function serveWidget(req: Request, res: Response) {
  try {
    // The widget is built to apps/widget/dist/ava-widget.iife.js.
    // We also copy it to apps/store/public/ — try several paths.
    const candidates = [
      join(__dirname, "../../../../widget/dist/ava-widget.iife.js"),
      join(__dirname, "../../../store/public/ava-widget.iife.js"),
    ];

    let widgetJs: string | null = null;
    for (const p of candidates) {
      try {
        widgetJs = readFileSync(p, "utf-8");
        break;
      } catch {
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
  } catch (error) {
    console.error("[API] serveWidget error:", error);
    res.status(500).send("// Internal server error");
  }
}

/**
 * POST /api/integration/:siteId/verify
 * Re-runs verification for the latest analyzer run (or an explicit runId).
 */
export async function verifyIntegration(req: Request, res: Response) {
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
          thresholds: FULL_ACTIVE_THRESHOLDS,
        }),
      }),
    ]);

    res.json({
      siteId,
      runId: run.id,
      verification,
      thresholds: FULL_ACTIVE_THRESHOLDS,
      recommendedMode: verification.recommendedMode,
    });
  } catch (error) {
    console.error("[API] Verify integration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/integration/:siteId/activate
 * Activates a site as `active` or `limited_active`.
 */
export async function activateIntegration(req: Request, res: Response) {
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

    const latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);
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
      criticalJourneys:
        verification?.criticalJourneysPassed ?? payload.criticalJourneysPassed,
    };

    const canBeFullyActive =
      gates.behaviorCoverage &&
      gates.frictionCoverage &&
      gates.avgConfidence &&
      gates.criticalJourneys;

    let mode: "active" | "limited_active";
    if (payload.mode === "active") {
      if (!canBeFullyActive) {
        res.status(400).json({
          error:
            "Cannot activate in full mode. Thresholds not met; use limited_active or mode=auto.",
          gates,
          thresholds,
        });
        return;
      }
      mode = "active";
    } else if (payload.mode === "limited_active") {
      mode = "limited_active";
    } else {
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
          thresholds: FULL_ACTIVE_THRESHOLDS,
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
  } catch (error) {
    console.error("[API] Activate integration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/site/reset?siteUrl=...
 * Resets a site's integration status back to "analyzing" (dormant).
 * Called by the demo wizard on startup so every demo session starts with the widget dormant.
 */
export async function resetSiteStatus(req: Request, res: Response) {
  const siteUrl = typeof req.query.siteUrl === "string" ? req.query.siteUrl : null;
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
  } catch (error) {
    console.error("[API] resetSiteStatus error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/site/status?siteUrl=...
 * Lightweight endpoint called by the widget on init to check if this site is activated.
 * Returns { status, activated } — no auth needed, read-only.
 */
export async function getSiteStatus(req: Request, res: Response) {
  const siteUrl = typeof req.query.siteUrl === "string" ? req.query.siteUrl : null;
  if (!siteUrl) {
    res.status(400).json({ error: "siteUrl query param is required" });
    return;
  }
  try {
    const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
    if (!site) {
      // Unknown site — respond with unactivated so widget stays dormant
      res.json({ status: "unknown", activated: false });
      return;
    }
    const activated =
      site.integrationStatus === "active" ||
      site.integrationStatus === "limited_active";
    res.json({ status: site.integrationStatus, activated });
  } catch (error) {
    console.error("[API] getSiteStatus error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

function parseTrackingHooks(trackingConfig: string, platform: string): TrackingHooks {
  try {
    const parsed = JSON.parse(trackingConfig) as TrackingHooks;
    if (parsed?.selectors && parsed?.eventMappings) {
      return parsed;
    }
  } catch {
    // Fallback below.
  }
  return generateHooks(platform);
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Derive the server's own base URL from the incoming request (for snippet generation). */
function getServerBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost:8080";
  return `${proto}://${host}`;
}
