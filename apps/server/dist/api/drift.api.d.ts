import type { Request, Response } from "express";
/**
 * GET /api/drift/status — Current drift health summary
 */
export declare function getStatus(req: Request, res: Response): Promise<void>;
/**
 * GET /api/drift/snapshots — Paginated snapshots
 */
export declare function listSnapshots(req: Request, res: Response): Promise<void>;
/**
 * GET /api/drift/alerts — Paginated alerts
 */
export declare function listAlerts(req: Request, res: Response): Promise<void>;
/**
 * POST /api/drift/alerts/:id/ack — Acknowledge an alert
 */
export declare function acknowledgeAlert(req: Request, res: Response): Promise<void>;
/**
 * POST /api/drift/check — Trigger on-demand drift check
 */
export declare function triggerDriftCheck(req: Request, res: Response): Promise<void>;
/**
 * POST /api/drift/selector-baseline
 * Body: { siteUrl, pageType }
 * Promotes the current SiteSelectorFingerprint row to baseline.
 */
export declare function promoteSelectorBaseline(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * GET /api/drift/selector-status?siteUrl=…
 * Returns per-pageType similarity, baseline presence, recent drift counters.
 */
export declare function getSelectorDriftStatus(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * POST /api/drift/selector-check
 * Body: { siteUrl, warnThreshold?, criticalThreshold? }
 * Manual trigger of the selector-drift comparison for a single site.
 */
export declare function triggerSelectorDriftCheck(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=drift.api.d.ts.map