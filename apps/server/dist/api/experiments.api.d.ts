import type { Request, Response } from "express";
/**
 * GET /api/experiments — List experiments
 */
export declare function list(req: Request, res: Response): Promise<void>;
/**
 * POST /api/experiments — Create experiment
 */
export declare function create(req: Request, res: Response): Promise<void>;
/**
 * GET /api/experiments/:id — Get experiment details
 */
export declare function get(req: Request, res: Response): Promise<any>;
/**
 * POST /api/experiments/:id/start — Start experiment
 */
export declare function start(req: Request, res: Response): Promise<void>;
/**
 * POST /api/experiments/:id/pause — Pause experiment
 */
export declare function pause(req: Request, res: Response): Promise<void>;
/**
 * POST /api/experiments/:id/end — End experiment
 */
export declare function end(req: Request, res: Response): Promise<void>;
/**
 * POST /api/experiments/model-test — Create a 2-variant model A/B test.
 * Control uses base model, treatment uses the specified fine-tuned model.
 * Body: { modelVersionId, siteUrl?, trafficPercent?, name? }
 */
export declare function createModelTest(req: Request, res: Response): Promise<void>;
/**
 * GET /api/experiments/:id/results — Get metrics + significance test
 */
export declare function results(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=experiments.api.d.ts.map