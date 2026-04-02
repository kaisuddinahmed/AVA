import type { ExportFilters } from "./training-export.service.js";
/** Quality grade assigned to each training datapoint. */
export type QualityGrade = "high" | "medium" | "low" | "rejected";
/** Per-datapoint quality assessment with reason tracking. */
export interface QualityAssessment {
    datapointId: string;
    grade: QualityGrade;
    score: number;
    checks: QualityCheckResult[];
    passedCount: number;
    failedCount: number;
}
export interface QualityCheckResult {
    check: string;
    passed: boolean;
    reason?: string;
}
/** Configurable quality filter thresholds. */
export interface QualityThresholds {
    /** Minimum events in the batch. Default: 2. */
    minEventCount: number;
    /** Maximum events (extremely long sessions may be bot traffic). Default: 200. */
    maxEventCount: number;
    /** Minimum session age in seconds. Default: 10. */
    minSessionAgeSec: number;
    /** Maximum session age to exclude stale/abandoned sessions. Default: 7200 (2h). */
    maxSessionAgeSec: number;
    /** Minimum narrative length in characters. Default: 20. */
    minNarrativeLength: number;
    /** Minimum clarity score. Default: 15. */
    minClarityScore: number;
    /** Maximum outcome delay in ms (causal linkage). Default: 300000 (5min). */
    maxOutcomeDelayMs: number;
    /** Minimum composite score to be non-trivial. Default: 5. */
    minCompositeScore: number;
    /** Require at least one friction detected. Default: false. */
    requireFriction: boolean;
    /** Outcomes to include. Default: ["converted", "dismissed"]. */
    validOutcomes: string[];
}
/** Summary stats from a quality filter run. */
export interface QualityFilterStats {
    total: number;
    gradeDistribution: Record<QualityGrade, number>;
    rejectionReasons: Record<string, number>;
    avgQualityScore: number;
    passRateByOutcome: Record<string, {
        total: number;
        passed: number;
        rate: number;
    }>;
    passRateByTier: Record<string, {
        total: number;
        passed: number;
        rate: number;
    }>;
}
/**
 * Assess quality of all datapoints matching the given filters.
 * Returns per-datapoint assessments and aggregate stats.
 */
export declare function assessQuality(filters: ExportFilters, thresholds?: Partial<QualityThresholds>): Promise<{
    assessments: QualityAssessment[];
    stats: QualityFilterStats;
}>;
/**
 * Get only the IDs of datapoints that pass quality checks at a given grade.
 * Useful for feeding into the formatter.
 */
export declare function getQualifiedIds(filters: ExportFilters, minGrade?: QualityGrade, thresholds?: Partial<QualityThresholds>): Promise<string[]>;
/**
 * Get just the quality stats without full assessments (lightweight).
 */
export declare function getQualityStats(filters: ExportFilters, thresholds?: Partial<QualityThresholds>): Promise<QualityFilterStats>;
//# sourceMappingURL=training-quality.service.d.ts.map