// ============================================================================
// Drift Detector — analyzes ShadowComparison + Intervention data over
// sliding windows to detect scoring/model drift and generate alerts.
// ============================================================================
import { prisma } from "@ava/db";
import { DriftSnapshotRepo, DriftAlertRepo, } from "@ava/db";
import { config } from "../config.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "jobs" });
// ---------------------------------------------------------------------------
// Window durations
// ---------------------------------------------------------------------------
const WINDOW_DURATIONS = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Compute a drift snapshot for a specific window type.
 * Queries ShadowComparison and Intervention tables.
 */
export async function computeWindowSnapshot(windowType, siteUrl) {
    const since = new Date(Date.now() - WINDOW_DURATIONS[windowType]);
    // Shadow comparison aggregates
    const shadowWhere = {
        createdAt: { gte: since },
    };
    if (siteUrl) {
        // Match by session's site — ShadowComparison doesn't have siteUrl directly,
        // so we aggregate globally for now
    }
    const [total, tierMatches, decisionMatches, avgDivergence] = await Promise.all([
        prisma.shadowComparison.count({ where: shadowWhere }),
        prisma.shadowComparison.count({
            where: { ...shadowWhere, tierMatch: true },
        }),
        prisma.shadowComparison.count({
            where: { ...shadowWhere, decisionMatch: true },
        }),
        prisma.shadowComparison.aggregate({
            where: shadowWhere,
            _avg: { compositeDivergence: true },
        }),
    ]);
    const tierAgreementRate = total > 0 ? tierMatches / total : 1;
    const decisionAgreementRate = total > 0 ? decisionMatches / total : 1;
    const avgCompositeDivergenceVal = avgDivergence._avg.compositeDivergence ?? 0;
    // Signal calibration by outcome from evaluations
    const evalWhere = {
        timestamp: { gte: since },
    };
    const signalCalibration = await computeSignalCalibration(evalWhere);
    // Outcome rates from interventions
    const interventionWhere = {
        timestamp: { gte: since },
        status: { in: ["converted", "dismissed", "ignored"] },
    };
    const [totalInterventions, convertedCount, dismissedCount] = await Promise.all([
        prisma.intervention.count({ where: interventionWhere }),
        prisma.intervention.count({
            where: { ...interventionWhere, status: "converted" },
        }),
        prisma.intervention.count({
            where: { ...interventionWhere, status: "dismissed" },
        }),
    ]);
    return {
        siteUrl: siteUrl ?? null,
        windowType,
        tierAgreementRate,
        decisionAgreementRate,
        avgCompositeDivergence: avgCompositeDivergenceVal,
        sampleCount: total,
        ...signalCalibration,
        conversionRate: totalInterventions > 0 ? convertedCount / totalInterventions : null,
        dismissalRate: totalInterventions > 0 ? dismissedCount / totalInterventions : null,
    };
}
/**
 * Run a full drift check across all windows. Compute snapshots, persist them,
 * compare against thresholds, and generate alerts.
 */
export async function runDriftCheck(siteUrl) {
    const thresholds = getDriftThresholds();
    const snapshots = [];
    const alerts = [];
    // Compute snapshots for each window
    const windowTypes = ["1h", "6h", "24h", "7d"];
    for (const windowType of windowTypes) {
        try {
            const snapshot = await computeWindowSnapshot(windowType, siteUrl);
            snapshots.push(snapshot);
            // Persist snapshot
            await DriftSnapshotRepo.createSnapshot(snapshot);
            // Detect anomalies by comparing to thresholds
            if (snapshot.sampleCount > 0) {
                // Get baseline (previous 7d snapshot for comparison)
                const baseline = windowType !== "7d"
                    ? await DriftSnapshotRepo.getLatestSnapshot("7d", siteUrl ?? null)
                    : null;
                const windowAlerts = detectAnomalies(snapshot, baseline, thresholds);
                // Dedup: only create if no recent unresolved alert of same type
                for (const alert of windowAlerts) {
                    const hasRecent = await DriftAlertRepo.hasRecentAlert(alert.alertType, alert.windowType, alert.siteUrl, 6);
                    if (!hasRecent) {
                        await DriftAlertRepo.createAlert(alert);
                        alerts.push(alert);
                    }
                }
            }
        }
        catch (error) {
            log.error(`[DriftDetector] Failed to compute ${windowType} snapshot:`, error);
        }
    }
    // Get active alert counts
    const activeAlerts = await DriftAlertRepo.getActiveAlerts(siteUrl ?? null);
    const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
    return {
        snapshots,
        alerts,
        summary: {
            isHealthy: criticalAlerts.length === 0,
            activeAlertCount: activeAlerts.length,
            criticalAlertCount: criticalAlerts.length,
        },
    };
}
/**
 * Get current drift health status without creating new snapshots.
 */
export async function getDriftStatus(siteUrl) {
    const activeAlerts = await DriftAlertRepo.getActiveAlerts(siteUrl ?? null);
    const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
    // Get latest snapshots for each window type
    const latestSnapshots = {};
    for (const wt of ["1h", "6h", "24h", "7d"]) {
        latestSnapshots[wt] = await DriftSnapshotRepo.getLatestSnapshot(wt, siteUrl ?? null);
    }
    return {
        isHealthy: criticalAlerts.length === 0,
        activeAlertCount: activeAlerts.length,
        criticalAlertCount: criticalAlerts.length,
        alerts: activeAlerts,
        latestSnapshots,
    };
}
// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------
function detectAnomalies(current, baseline, thresholds) {
    const alerts = [];
    // 1. Tier agreement drop
    if (current.tierAgreementRate < thresholds.tierAgreementFloor) {
        const severity = current.tierAgreementRate < thresholds.tierAgreementFloor * 0.78
            ? "critical"
            : "warning";
        alerts.push({
            siteUrl: current.siteUrl,
            alertType: "tier_agreement_drop",
            severity,
            windowType: current.windowType,
            metric: "tierAgreementRate",
            expected: thresholds.tierAgreementFloor,
            actual: current.tierAgreementRate,
            message: `Tier agreement rate dropped to ${(current.tierAgreementRate * 100).toFixed(1)}% (threshold: ${(thresholds.tierAgreementFloor * 100).toFixed(1)}%) in ${current.windowType} window`,
        });
    }
    // 2. Decision agreement drop
    if (current.decisionAgreementRate < thresholds.decisionAgreementFloor) {
        const severity = current.decisionAgreementRate < thresholds.decisionAgreementFloor * 0.80
            ? "critical"
            : "warning";
        alerts.push({
            siteUrl: current.siteUrl,
            alertType: "decision_agreement_drop",
            severity,
            windowType: current.windowType,
            metric: "decisionAgreementRate",
            expected: thresholds.decisionAgreementFloor,
            actual: current.decisionAgreementRate,
            message: `Decision agreement rate dropped to ${(current.decisionAgreementRate * 100).toFixed(1)}% (threshold: ${(thresholds.decisionAgreementFloor * 100).toFixed(1)}%) in ${current.windowType} window`,
        });
    }
    // 3. Composite divergence spike
    if (current.avgCompositeDivergence > thresholds.maxCompositeDivergence) {
        alerts.push({
            siteUrl: current.siteUrl,
            alertType: "divergence_spike",
            severity: "warning",
            windowType: current.windowType,
            metric: "avgCompositeDivergence",
            expected: thresholds.maxCompositeDivergence,
            actual: current.avgCompositeDivergence,
            message: `Avg composite divergence spiked to ${current.avgCompositeDivergence.toFixed(1)} points (threshold: ${thresholds.maxCompositeDivergence}) in ${current.windowType} window`,
        });
    }
    // 4. Signal calibration shift (compare converted vs dismissed signals)
    const signalPairs = [
        ["intent", current.avgIntentConverted, current.avgIntentDismissed],
        ["friction", current.avgFrictionConverted, current.avgFrictionDismissed],
        ["clarity", current.avgClarityConverted, current.avgClarityDismissed],
        [
            "receptivity",
            current.avgReceptivityConverted,
            current.avgReceptivityDismissed,
        ],
        ["value", current.avgValueConverted, current.avgValueDismissed],
        [
            "composite",
            current.avgCompositeConverted,
            current.avgCompositeDismissed,
        ],
    ];
    for (const [signal, convAvg, dismAvg] of signalPairs) {
        if (convAvg != null && dismAvg != null) {
            // For composite — converted should be higher than dismissed
            // If the gap collapses, that's a signal shift
            if (signal === "composite") {
                const gap = convAvg - dismAvg;
                if (gap < thresholds.signalShiftThreshold * 0.5) {
                    alerts.push({
                        siteUrl: current.siteUrl,
                        alertType: "signal_shift",
                        severity: "warning",
                        windowType: current.windowType,
                        metric: `${signal}_calibration_gap`,
                        expected: thresholds.signalShiftThreshold,
                        actual: gap,
                        message: `${signal} calibration gap collapsed to ${gap.toFixed(1)} points between converted (${convAvg.toFixed(1)}) and dismissed (${dismAvg.toFixed(1)}) in ${current.windowType} window`,
                    });
                }
            }
        }
    }
    // 5. Conversion rate drop (compare to baseline)
    if (current.conversionRate != null &&
        baseline?.conversionRate != null &&
        baseline.conversionRate > 0) {
        const relDrop = (baseline.conversionRate - current.conversionRate) /
            baseline.conversionRate;
        if (relDrop > thresholds.conversionRateDropPercent) {
            alerts.push({
                siteUrl: current.siteUrl,
                alertType: "conversion_drop",
                severity: "critical",
                windowType: current.windowType,
                metric: "conversionRate",
                expected: baseline.conversionRate,
                actual: current.conversionRate,
                message: `Conversion rate dropped ${(relDrop * 100).toFixed(1)}% from baseline (${(baseline.conversionRate * 100).toFixed(1)}% → ${(current.conversionRate * 100).toFixed(1)}%) in ${current.windowType} window`,
            });
        }
    }
    return alerts;
}
async function computeSignalCalibration(evalWhere) {
    // Get avg signals for converted interventions
    const convertedEvals = await prisma.evaluation.aggregate({
        where: {
            ...evalWhere,
            intervention: { status: "converted" },
        },
        _avg: {
            intentScore: true,
            frictionScore: true,
            clarityScore: true,
            receptivityScore: true,
            valueScore: true,
            compositeScore: true,
        },
    });
    // Get avg signals for dismissed interventions
    const dismissedEvals = await prisma.evaluation.aggregate({
        where: {
            ...evalWhere,
            intervention: { status: "dismissed" },
        },
        _avg: {
            intentScore: true,
            frictionScore: true,
            clarityScore: true,
            receptivityScore: true,
            valueScore: true,
            compositeScore: true,
        },
    });
    return {
        avgIntentConverted: convertedEvals._avg.intentScore,
        avgIntentDismissed: dismissedEvals._avg.intentScore,
        avgFrictionConverted: convertedEvals._avg.frictionScore,
        avgFrictionDismissed: dismissedEvals._avg.frictionScore,
        avgClarityConverted: convertedEvals._avg.clarityScore,
        avgClarityDismissed: dismissedEvals._avg.clarityScore,
        avgReceptivityConverted: convertedEvals._avg.receptivityScore,
        avgReceptivityDismissed: dismissedEvals._avg.receptivityScore,
        avgValueConverted: convertedEvals._avg.valueScore,
        avgValueDismissed: dismissedEvals._avg.valueScore,
        avgCompositeConverted: convertedEvals._avg.compositeScore,
        avgCompositeDismissed: dismissedEvals._avg.compositeScore,
    };
}
function getDriftThresholds() {
    return {
        tierAgreementFloor: config.drift.tierAgreementFloor,
        decisionAgreementFloor: config.drift.decisionAgreementFloor,
        maxCompositeDivergence: config.drift.maxCompositeDivergence,
        signalShiftThreshold: config.drift.signalShiftThreshold,
        conversionRateDropPercent: config.drift.conversionRateDropPercent,
    };
}
//# sourceMappingURL=drift-detector.js.map