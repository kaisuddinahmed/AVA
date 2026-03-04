import type { Request, Response } from "express";
import {
  AnalyzerRunRepo,
  IntegrationStatusRepo,
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

    const latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);
    const verification = latestRun
      ? await verifyIntegrationReadiness({
          analyzerRunId: latestRun.id,
          siteConfigId: siteId,
          trackingHooks: parseTrackingHooks(site.trackingConfig, site.platform),
        })
      : null;

    const gates = {
      behaviorCoverage: (verification?.behaviorCoveragePct ?? 0) >= FULL_ACTIVE_THRESHOLDS.behaviorCoveragePct,
      frictionCoverage: (verification?.frictionCoveragePct ?? 0) >= FULL_ACTIVE_THRESHOLDS.frictionCoveragePct,
      avgConfidence: (verification?.avgConfidence ?? 0) >= FULL_ACTIVE_THRESHOLDS.avgConfidence,
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
          thresholds: FULL_ACTIVE_THRESHOLDS,
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
      thresholds: FULL_ACTIVE_THRESHOLDS,
      verification,
      runId: latestRun?.id ?? null,
    });
  } catch (error) {
    console.error("[API] Activate integration error:", error);
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
