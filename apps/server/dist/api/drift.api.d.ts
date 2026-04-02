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
//# sourceMappingURL=drift.api.d.ts.map