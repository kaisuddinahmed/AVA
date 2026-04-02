import type { Request, Response } from "express";
/**
 * GET /api/insights/latest?siteUrl=
 * Returns the most recent InsightSnapshot for a site (weekly digest + AI recs).
 */
export declare function getLatestInsights(req: Request, res: Response): Promise<void>;
/**
 * GET /api/insights/cro?siteUrl=
 * Returns the latest CRO structural findings for a site.
 */
export declare function getCROFindings(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=insights.api.d.ts.map