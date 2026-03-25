export interface CreateInsightSnapshotInput {
    siteUrl: string;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    attributedRevenue: number;
    topFrictionTypes: string;
    wowDeltaPct?: number;
    recommendations: string;
    croFindings?: string;
}
export declare function createInsightSnapshot(data: CreateInsightSnapshotInput): Promise<{
    id: string;
    siteUrl: string;
    attributedRevenue: number;
    createdAt: Date;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    topFrictionTypes: string;
    wowDeltaPct: number | null;
    recommendations: string;
    croFindings: string | null;
}>;
export declare function getLatestInsightSnapshot(siteUrl: string): Promise<{
    id: string;
    siteUrl: string;
    attributedRevenue: number;
    createdAt: Date;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    topFrictionTypes: string;
    wowDeltaPct: number | null;
    recommendations: string;
    croFindings: string | null;
} | null>;
export declare function getLatestCROFindings(siteUrl: string): Promise<{
    id: string;
    siteUrl: string;
    attributedRevenue: number;
    createdAt: Date;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    topFrictionTypes: string;
    wowDeltaPct: number | null;
    recommendations: string;
    croFindings: string | null;
} | null>;
export declare function listInsightSnapshots(siteUrl: string, limit?: number): Promise<{
    id: string;
    siteUrl: string;
    attributedRevenue: number;
    createdAt: Date;
    periodStart: Date;
    periodEnd: Date;
    sessionsAnalyzed: number;
    frictionsCaught: number;
    topFrictionTypes: string;
    wowDeltaPct: number | null;
    recommendations: string;
    croFindings: string | null;
}[]>;
//# sourceMappingURL=insight-snapshot.repo.d.ts.map