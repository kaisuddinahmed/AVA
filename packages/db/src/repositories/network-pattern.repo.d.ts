export interface NetworkPatternData {
    frictionId: string;
    category: string;
    avgSeverity: number;
    avgConversionImpact: number;
    merchantCount: number;
    totalSessions: number;
}
/**
 * Upsert a network pattern record. Called by the weekly flywheel job.
 * Enforces k-anonymity: only writes when merchantCount >= 3.
 */
export declare function upsertNetworkPattern(data: NetworkPatternData): Promise<{
    id: string;
    category: string;
    frictionId: string;
    updatedAt: Date;
    avgSeverity: number;
    avgConversionImpact: number;
    merchantCount: number;
    totalSessions: number;
} | null>;
/**
 * Get a single network pattern for a given frictionId.
 * Used by fast evaluator as a prior for new merchants.
 */
export declare function getNetworkPattern(frictionId: string): Promise<{
    id: string;
    category: string;
    frictionId: string;
    updatedAt: Date;
    avgSeverity: number;
    avgConversionImpact: number;
    merchantCount: number;
    totalSessions: number;
} | null>;
/**
 * Get all network patterns, ordered by impact (highest first).
 */
export declare function listNetworkPatterns(): Promise<{
    id: string;
    category: string;
    frictionId: string;
    updatedAt: Date;
    avgSeverity: number;
    avgConversionImpact: number;
    merchantCount: number;
    totalSessions: number;
}[]>;
/**
 * Count the number of published network patterns.
 */
export declare function countNetworkPatterns(): Promise<number>;
//# sourceMappingURL=network-pattern.repo.d.ts.map