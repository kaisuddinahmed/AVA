export interface CROFinding {
    frictionId: string;
    page: string;
    eventCount: number;
    avgSeverity: number;
    sessionsImpacted: number;
    suggestion: string;
}
/**
 * Run CRO analysis for a site and attach findings to the latest InsightSnapshot.
 * If no snapshot exists for today, creates a minimal one.
 */
export declare function runCROAnalysis(siteUrl: string): Promise<CROFinding[]>;
//# sourceMappingURL=cro-analysis.service.d.ts.map