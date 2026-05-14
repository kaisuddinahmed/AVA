import type { DriftAlertType, DriftSeverity, WindowType } from "@ava/shared";
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
/**
 * Compute a drift snapshot for a specific window type.
 * Queries ShadowComparison and Intervention tables.
 */
export declare function computeWindowSnapshot(windowType: WindowType, siteUrl?: string | null): Promise<DriftSnapshotData>;
/**
 * Run a full drift check across all windows. Compute snapshots, persist them,
 * compare against thresholds, and generate alerts.
 */
export declare function runDriftCheck(siteUrl?: string | null): Promise<DriftCheckResult>;
/**
 * Get current drift health status without creating new snapshots.
 */
export declare function getDriftStatus(siteUrl?: string | null): Promise<{
    isHealthy: boolean;
    activeAlertCount: number;
    criticalAlertCount: number;
    alerts: {
        id: string;
        siteUrl: string | null;
        createdAt: Date;
        windowType: string;
        alertType: string;
        severity: string;
        metric: string;
        expected: number;
        actual: number;
        message: string;
        acknowledged: boolean;
        acknowledgedAt: Date | null;
        resolvedAt: Date | null;
    }[];
    latestSnapshots: Record<string, unknown>;
}>;
//# sourceMappingURL=drift-detector.d.ts.map