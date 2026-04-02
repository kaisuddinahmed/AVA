import type { Request, Response } from "express";
/**
 * GET /api/jobs/runs — List recent job runs
 */
export declare function listJobRuns(req: Request, res: Response): Promise<void>;
/**
 * GET /api/jobs/runs/:id — Get specific run details
 */
export declare function getJobRun(req: Request, res: Response): Promise<any>;
/**
 * POST /api/jobs/trigger — Trigger a job manually
 */
export declare function triggerJob(req: Request, res: Response): Promise<void>;
/**
 * GET /api/jobs/next-run — Next scheduled nightly batch time
 */
export declare function getNextRun(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=jobs.api.d.ts.map