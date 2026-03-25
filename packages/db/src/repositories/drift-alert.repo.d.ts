export type CreateDriftAlertInput = {
    siteUrl?: string | null;
    alertType: string;
    severity: string;
    windowType: string;
    metric: string;
    expected: number;
    actual: number;
    message: string;
};
export declare function createAlert(data: CreateDriftAlertInput): Promise<{
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
}>;
export declare function acknowledgeAlert(id: string): Promise<{
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
}>;
export declare function resolveAlert(id: string): Promise<{
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
}>;
export declare function listAlerts(options?: {
    siteUrl?: string | null;
    alertType?: string;
    severity?: string;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
}): Promise<{
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
}[]>;
export declare function getActiveAlerts(siteUrl?: string | null): Promise<{
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
}[]>;
export declare function countBySeverity(since?: Date): Promise<Record<string, number>>;
/**
 * Check if a similar alert already exists (for dedup).
 * Returns true if an unresolved alert of the same type/window exists within the last N hours.
 */
export declare function hasRecentAlert(alertType: string, windowType: string, siteUrl: string | null, withinHours?: number): Promise<boolean>;
//# sourceMappingURL=drift-alert.repo.d.ts.map