export interface FingerprintBaseline {
    hash: string;
    selectors: Record<string, string>;
}
export interface FingerprintCurrent {
    hash: string;
    selectors: Record<string, string>;
}
export interface SimilarityResult {
    /** 0..1 — 1 = identical, 0 = totally diverged. */
    score: number;
    /** Keys present in baseline but missing from current. */
    missingKeys: string[];
    /** Keys present in both but with different selector strings. */
    changedKeys: string[];
    /** Keys only in current (the site grew). */
    addedKeys: string[];
    /** Quick yes/no — true iff the SHA fingerprints already match. */
    identicalHash: boolean;
}
export interface PageTypeDriftResult {
    pageType: string;
    /** null when no baseline exists for this (siteUrl, pageType). */
    similarity: SimilarityResult | null;
    /** Was an alert emitted this run? */
    alertEmitted: boolean;
    /** Was an alert SKIPPED because a recent one already exists? */
    alertSuppressed: boolean;
}
export interface SiteDriftResult {
    siteUrl: string;
    results: PageTypeDriftResult[];
    /** Average similarity across page types that had a baseline. */
    overallSimilarity: number | null;
}
export interface DriftCheckOptions {
    /** Below this overall similarity, emit alerts. Default 0.7. */
    warnThreshold?: number;
    /** Below THIS, alert is `critical` instead of `warning`. Default 0.4. */
    criticalThreshold?: number;
    /** Suppress duplicate alerts within this many hours. Default 6 (per CLAUDE.md). */
    dedupWindowHours?: number;
}
/**
 * Compute selector-set similarity between baseline and current. Strategy:
 *
 *   - If hashes match exactly → score=1, no further work.
 *   - Otherwise compute symmetric difference over the selector key sets,
 *     then for shared keys check whether the selector strings agree.
 *
 * Score is calibrated so a typical theme reskin (~half the selectors change
 * but the schema is preserved) lands in the 0.4–0.7 band, prompting a
 * `warning` rather than `critical`.
 */
export declare function compareFingerprints(baseline: FingerprintBaseline, current: FingerprintCurrent): SimilarityResult;
/**
 * Run a drift check for every (siteUrl, pageType) row that has a baseline.
 * Emits a DriftAlert per pageType whose similarity falls below the warn
 * threshold, deduplicated by the existing 6h hasRecentAlert primitive.
 *
 * Rows WITHOUT a baseline are silently skipped — the lifecycle guarantee
 * is "no comparison until baseline." That's why baseline capture lives in
 * the repo's `markAsBaseline`, separate from this service.
 */
export declare function checkDriftForSite(siteUrl: string, opts?: DriftCheckOptions): Promise<SiteDriftResult>;
//# sourceMappingURL=selector-drift.service.d.ts.map