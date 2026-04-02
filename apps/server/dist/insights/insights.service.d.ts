export interface InsightRecommendation {
    frictionId: string;
    page: string;
    impactEstimate: string;
    fixText: string;
    confidence: "high" | "medium" | "low";
    sampleSize: number;
}
export interface InsightDigest {
    siteUrl: string;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    attributedRevenue: number;
    topFrictionTypes: string[];
    wowDeltaPct: number | null;
    recommendations: InsightRecommendation[];
}
/**
 * Generate (or refresh) the insight snapshot for a site.
 * Safe to call from nightly batch — idempotent within same calendar day.
 */
export declare function generateInsightSnapshot(siteUrl: string): Promise<InsightDigest>;
//# sourceMappingURL=insights.service.d.ts.map