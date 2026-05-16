// ============================================================================
// Drift API — drift detection status, snapshots, and alerts
// ============================================================================
import { DriftSnapshotRepo, DriftAlertRepo, SiteSelectorFingerprintRepo, } from "@ava/db";
import { getDriftStatus, runDriftCheck } from "../jobs/drift-detector.js";
import { checkDriftForSite } from "../crawl/selector-drift.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
/**
 * GET /api/drift/status — Current drift health summary
 */
export async function getStatus(req, res) {
    try {
        const { siteUrl } = req.query;
        const status = await getDriftStatus(siteUrl || null);
        res.json(status);
    }
    catch (error) {
        log.error("[Drift API] getStatus error:", error);
        res.status(500).json({ error: "Failed to get drift status" });
    }
}
/**
 * GET /api/drift/snapshots — Paginated snapshots
 */
export async function listSnapshots(req, res) {
    try {
        const { siteUrl, windowType, since, until, limit = "50", offset = "0", } = req.query;
        const snapshots = await DriftSnapshotRepo.listSnapshots({
            siteUrl: siteUrl || undefined,
            windowType: windowType || undefined,
            since: since ? new Date(since) : undefined,
            until: until ? new Date(until) : undefined,
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json({ snapshots, count: snapshots.length });
    }
    catch (error) {
        log.error("[Drift API] listSnapshots error:", error);
        res.status(500).json({ error: "Failed to list snapshots" });
    }
}
/**
 * GET /api/drift/alerts — Paginated alerts
 */
export async function listAlerts(req, res) {
    try {
        const { siteUrl, alertType, severity, acknowledged, limit = "50", offset = "0", } = req.query;
        const alerts = await DriftAlertRepo.listAlerts({
            siteUrl: siteUrl || undefined,
            alertType: alertType || undefined,
            severity: severity || undefined,
            acknowledged: acknowledged !== undefined
                ? acknowledged === "true"
                : undefined,
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json({ alerts, count: alerts.length });
    }
    catch (error) {
        log.error("[Drift API] listAlerts error:", error);
        res.status(500).json({ error: "Failed to list alerts" });
    }
}
/**
 * POST /api/drift/alerts/:id/ack — Acknowledge an alert
 */
export async function acknowledgeAlert(req, res) {
    try {
        const alert = await DriftAlertRepo.acknowledgeAlert(String(req.params.id));
        res.json(alert);
    }
    catch (error) {
        log.error("[Drift API] acknowledgeAlert error:", error);
        res.status(500).json({ error: "Failed to acknowledge alert" });
    }
}
/**
 * POST /api/drift/check — Trigger on-demand drift check
 */
export async function triggerDriftCheck(req, res) {
    try {
        const { siteUrl } = req.body;
        const result = await runDriftCheck(siteUrl || null);
        res.json(result);
    }
    catch (error) {
        log.error("[Drift API] triggerDriftCheck error:", error);
        res.status(500).json({ error: "Failed to run drift check" });
    }
}
// ---------------------------------------------------------------------------
// Phase 1.5.6 — Selector-drift endpoints (split-lifecycle: baseline + check)
// ---------------------------------------------------------------------------
/**
 * POST /api/drift/selector-baseline
 * Body: { siteUrl, pageType }
 * Promotes the current SiteSelectorFingerprint row to baseline.
 */
export async function promoteSelectorBaseline(req, res) {
    try {
        const { siteUrl, pageType } = (req.body ?? {});
        if (!siteUrl || !pageType) {
            return res.status(400).json({ error: "siteUrl and pageType are required" });
        }
        const updated = await SiteSelectorFingerprintRepo.markAsBaseline(siteUrl, pageType);
        if (!updated) {
            return res.status(404).json({ error: "No fingerprint row for that (siteUrl, pageType)" });
        }
        res.json({
            siteUrl: updated.siteUrl,
            pageType: updated.pageType,
            baselineHash: updated.baselineHash,
            baselineCapturedAt: updated.baselineCapturedAt,
        });
    }
    catch (error) {
        log.error({ err: error }, "[Drift API] promoteSelectorBaseline error");
        res.status(500).json({ error: "Failed to promote baseline" });
    }
}
/**
 * GET /api/drift/selector-status?siteUrl=…
 * Returns per-pageType similarity, baseline presence, recent drift counters.
 */
export async function getSelectorDriftStatus(req, res) {
    try {
        const siteUrl = req.query.siteUrl ?? "";
        if (!siteUrl) {
            return res.status(400).json({ error: "siteUrl query param required" });
        }
        const rows = await SiteSelectorFingerprintRepo.listForSite(siteUrl);
        res.json({
            siteUrl,
            pageTypes: rows.map((r) => ({
                pageType: r.pageType,
                hasBaseline: Boolean(r.baselineHash),
                baselineCapturedAt: r.baselineCapturedAt,
                fingerprintHash: r.fingerprintHash,
                hashesMatch: Boolean(r.baselineHash) && r.baselineHash === r.fingerprintHash,
                driftCount: r.driftCount,
                lastDriftAt: r.lastDriftAt,
                lastCheckedAt: r.lastCheckedAt,
            })),
        });
    }
    catch (error) {
        log.error({ err: error }, "[Drift API] getSelectorDriftStatus error");
        res.status(500).json({ error: "Failed to get selector-drift status" });
    }
}
/**
 * POST /api/drift/selector-check
 * Body: { siteUrl, warnThreshold?, criticalThreshold? }
 * Manual trigger of the selector-drift comparison for a single site.
 */
export async function triggerSelectorDriftCheck(req, res) {
    try {
        const { siteUrl, warnThreshold, criticalThreshold } = (req.body ?? {});
        if (!siteUrl) {
            return res.status(400).json({ error: "siteUrl required" });
        }
        const result = await checkDriftForSite(siteUrl, { warnThreshold, criticalThreshold });
        res.json(result);
    }
    catch (error) {
        log.error({ err: error }, "[Drift API] triggerSelectorDriftCheck error");
        res.status(500).json({ error: "Failed to run selector-drift check" });
    }
}
//# sourceMappingURL=drift.api.js.map