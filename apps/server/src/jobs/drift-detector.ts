// ============================================================================
// Drift Detector — analyzes ShadowComparison + Intervention data over
// sliding windows to detect scoring/model drift and generate alerts.
// ============================================================================

import {
  DriftSnapshotRepo,
  DriftAlertRepo,
  ShadowComparisonRepo,
  InterventionRepo,
  EvaluationRepo,
} from "@ava/db";
import { createDriftAlertWithNotify } from "../drift/drift-create.service.js";
import { config } from "../config.js";
import type {
  DriftThresholds,
  DriftAlertType,
  DriftSeverity,
  WindowType,
} from "@ava/shared";
import { logger } from "../logger.js";

const log = logger.child({ service: "jobs" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftSnapshotData {
  siteUrl: string | null;
  windowType: WindowType;
  tierAgreementRate: number;
  decisionAgreementRate: number;
  avgCompositeDivergence: number;
  sampleCount: number;
  avgIntentConverted: number | null;
  avgIntentDismissed: number | null;
  avgFrictionConverted: number | null;
  avgFrictionDismissed: number | null;
  avgClarityConverted: number | null;
  avgClarityDismissed: number | null;
  avgReceptivityConverted: number | null;
  avgReceptivityDismissed: number | null;
  avgValueConverted: number | null;
  avgValueDismissed: number | null;
  avgCompositeConverted: number | null;
  avgCompositeDismissed: number | null;
  conversionRate: number | null;
  dismissalRate: number | null;
}

export interface DriftAlertData {
  siteUrl: string | null;
  alertType: DriftAlertType;
  severity: DriftSeverity;
  windowType: WindowType;
  metric: string;
  expected: number;
  actual: number;
  message: string;
}

export interface DriftCheckResult {
  snapshots: DriftSnapshotData[];
  alerts: DriftAlertData[];
  summary: {
    isHealthy: boolean;
    activeAlertCount: number;
    criticalAlertCount: number;
  };
}

// ---------------------------------------------------------------------------
// Window durations
// ---------------------------------------------------------------------------

const WINDOW_DURATIONS: Record<WindowType, number> = {
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
export async function computeWindowSnapshot(
  windowType: WindowType,
  siteUrl?: string | null,
): Promise<DriftSnapshotData> {
  const since = new Date(Date.now() - WINDOW_DURATIONS[windowType]);

  // NOTE: ShadowComparison doesn't have siteUrl directly, so we aggregate
  // globally even when siteUrl is provided. Documented limitation.

  const shadow = await ShadowComparisonRepo.getDriftAggregatesSince(since);
  const tierAgreementRate = shadow.total > 0 ? shadow.tierMatches / shadow.total : 1;
  const decisionAgreementRate = shadow.total > 0 ? shadow.decisionMatches / shadow.total : 1;

  // Signal calibration by outcome
  const signalCalibration = await computeSignalCalibration(since);

  // Outcome rates from interventions
  const outcomes = await InterventionRepo.getOutcomeCounts(since);

  return {
    siteUrl: siteUrl ?? null,
    windowType,
    tierAgreementRate,
    decisionAgreementRate,
    avgCompositeDivergence: shadow.avgCompositeDivergence,
    sampleCount: shadow.total,
    ...signalCalibration,
    conversionRate: outcomes.total > 0 ? outcomes.converted / outcomes.total : null,
    dismissalRate: outcomes.total > 0 ? outcomes.dismissed / outcomes.total : null,
  };
}

/**
 * Run a full drift check across all windows. Compute snapshots, persist them,
 * compare against thresholds, and generate alerts.
 */
export async function runDriftCheck(
  siteUrl?: string | null,
): Promise<DriftCheckResult> {
  const thresholds = getDriftThresholds();
  const snapshots: DriftSnapshotData[] = [];
  const alerts: DriftAlertData[] = [];

  // Compute snapshots for each window
  const windowTypes: WindowType[] = ["1h", "6h", "24h", "7d"];

  for (const windowType of windowTypes) {
    try {
      const snapshot = await computeWindowSnapshot(windowType, siteUrl);
      snapshots.push(snapshot);

      // Persist snapshot
      await DriftSnapshotRepo.createSnapshot(snapshot);

      // Detect anomalies by comparing to thresholds
      if (snapshot.sampleCount > 0) {
        // Get baseline (previous 7d snapshot for comparison)
        const baseline =
          windowType !== "7d"
            ? await DriftSnapshotRepo.getLatestSnapshot("7d", siteUrl ?? null)
            : null;

        const windowAlerts = detectAnomalies(
          snapshot,
          baseline,
          thresholds,
        );

        // Dedup: only create if no recent unresolved alert of same type
        for (const alert of windowAlerts) {
          const hasRecent = await DriftAlertRepo.hasRecentAlert(
            alert.alertType,
            alert.windowType,
            alert.siteUrl,
            6,
          );
          if (!hasRecent) {
            // Phase 4.2 — persist + notify (email + critical-only PagerDuty).
            // Notifier failures never throw; the alert always lands.
            await createDriftAlertWithNotify(alert);
            alerts.push(alert);
          }
        }
      }
    } catch (error) {
      log.error(
        `[DriftDetector] Failed to compute ${windowType} snapshot:`,
        error,
      );
    }
  }

  // Get active alert counts
  const activeAlerts = await DriftAlertRepo.getActiveAlerts(siteUrl ?? null);
  const criticalAlerts = activeAlerts.filter(
    (a) => a.severity === "critical",
  );

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
export async function getDriftStatus(siteUrl?: string | null) {
  const activeAlerts = await DriftAlertRepo.getActiveAlerts(siteUrl ?? null);
  const criticalAlerts = activeAlerts.filter(
    (a) => a.severity === "critical",
  );

  // Get latest snapshots for each window type
  const latestSnapshots: Record<string, unknown> = {};
  for (const wt of ["1h", "6h", "24h", "7d"] as const) {
    latestSnapshots[wt] = await DriftSnapshotRepo.getLatestSnapshot(
      wt,
      siteUrl ?? null,
    );
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

function detectAnomalies(
  current: DriftSnapshotData,
  baseline: { conversionRate?: number | null } | null,
  thresholds: DriftThresholds,
): DriftAlertData[] {
  const alerts: DriftAlertData[] = [];

  // 1. Tier agreement drop
  if (current.tierAgreementRate < thresholds.tierAgreementFloor) {
    const severity: DriftSeverity =
      current.tierAgreementRate < thresholds.tierAgreementFloor * 0.78
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
    const severity: DriftSeverity =
      current.decisionAgreementRate < thresholds.decisionAgreementFloor * 0.80
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
  const signalPairs: [string, number | null, number | null][] = [
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
  if (
    current.conversionRate != null &&
    baseline?.conversionRate != null &&
    baseline.conversionRate > 0
  ) {
    const relDrop =
      (baseline.conversionRate - current.conversionRate) /
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

async function computeSignalCalibration(since: Date) {
  const [convertedAvg, dismissedAvg] = await Promise.all([
    EvaluationRepo.getAvgSignalsByOutcome(since, "converted"),
    EvaluationRepo.getAvgSignalsByOutcome(since, "dismissed"),
  ]);

  return {
    avgIntentConverted: convertedAvg.intentScore,
    avgIntentDismissed: dismissedAvg.intentScore,
    avgFrictionConverted: convertedAvg.frictionScore,
    avgFrictionDismissed: dismissedAvg.frictionScore,
    avgClarityConverted: convertedAvg.clarityScore,
    avgClarityDismissed: dismissedAvg.clarityScore,
    avgReceptivityConverted: convertedAvg.receptivityScore,
    avgReceptivityDismissed: dismissedAvg.receptivityScore,
    avgValueConverted: convertedAvg.valueScore,
    avgValueDismissed: dismissedAvg.valueScore,
    avgCompositeConverted: convertedAvg.compositeScore,
    avgCompositeDismissed: dismissedAvg.compositeScore,
  };
}

function getDriftThresholds(): DriftThresholds {
  return {
    tierAgreementFloor: config.drift.tierAgreementFloor,
    decisionAgreementFloor: config.drift.decisionAgreementFloor,
    maxCompositeDivergence: config.drift.maxCompositeDivergence,
    signalShiftThreshold: config.drift.signalShiftThreshold,
    conversionRateDropPercent: config.drift.conversionRateDropPercent,
  };
}
