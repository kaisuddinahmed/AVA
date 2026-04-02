export interface ExportFilters {
    outcome?: string;
    tier?: string;
    siteUrl?: string;
    frictionId?: string;
    interventionType?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
}
export interface ExportStats {
    totalDatapoints: number;
    filteredCount: number;
    outcomeDistribution: Record<string, number>;
    tierDistribution: Record<string, number>;
    avgCompositeScore: number;
    avgOutcomeDelayMs: number | null;
    dateRange: {
        earliest: string | null;
        latest: string | null;
    };
}
/**
 * Fine-tuning record format — what gets written to JSONL.
 * Structured as input/output pairs for supervised fine-tuning.
 */
export interface FineTuningRecord {
    input: {
        sessionContext: {
            deviceType: string;
            referrerType: string;
            isLoggedIn: boolean;
            isRepeatVisitor: boolean;
            cartValue: number;
            cartItemCount: number;
            sessionAgeSec: number;
            totalInterventionsFired: number;
            totalDismissals: number;
            totalConversions: number;
        };
        events: unknown[];
        pageType: string;
    };
    output: {
        narrative: string;
        frictionsFound: string[];
        scores: {
            intent: number;
            friction: number;
            clarity: number;
            receptivity: number;
            value: number;
        };
    };
    decision: {
        compositeScore: number;
        tier: string;
        decision: string;
        gateOverride: string | null;
        interventionType: string;
        actionCode: string;
        frictionId: string;
    };
    outcome: {
        label: string;
        conversionAction: string | null;
        outcomeDelayMs: number | null;
    };
    meta: {
        datapointId: string;
        sessionId: string;
        evaluationId: string;
        interventionId: string;
        siteUrl: string;
        createdAt: string;
        weightsUsed: unknown;
        mswimScoreAtFire: number;
        tierAtFire: string;
    };
}
/**
 * Export training datapoints as an array of FineTuningRecords.
 */
export declare function exportAsRecords(filters: ExportFilters): Promise<FineTuningRecord[]>;
/**
 * Export as JSONL string (one JSON object per line).
 * Standard format for fine-tuning pipelines.
 */
export declare function exportAsJsonl(filters: ExportFilters): Promise<string>;
/**
 * Export as CSV string.
 * Flattened format for spreadsheet analysis / quick inspection.
 */
export declare function exportAsCsv(filters: ExportFilters): Promise<string>;
/**
 * Get summary statistics for the training dataset (with optional filters).
 */
export declare function getExportStats(filters: ExportFilters): Promise<ExportStats>;
//# sourceMappingURL=training-export.service.d.ts.map