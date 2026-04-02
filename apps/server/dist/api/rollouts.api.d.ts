import type { Request, Response } from "express";
/**
 * GET /api/rollouts — List rollouts
 */
export declare function list(req: Request, res: Response): Promise<void>;
/**
 * POST /api/rollouts — Create rollout
 */
export declare function create(req: Request, res: Response): Promise<void>;
/**
 * GET /api/rollouts/:id — Get rollout details + health status
 */
export declare function get(req: Request, res: Response): Promise<any>;
/**
 * POST /api/rollouts/:id/start — Start rollout
 */
export declare function start(req: Request, res: Response): Promise<void>;
/**
 * POST /api/rollouts/:id/promote — Manual promote to next stage
 */
export declare function promote(req: Request, res: Response): Promise<void>;
/**
 * POST /api/rollouts/:id/rollback — Manual rollback
 */
export declare function rollback(req: Request, res: Response): Promise<void>;
/**
 * POST /api/rollouts/:id/pause — Pause rollout
 */
export declare function pauseRolloutEndpoint(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=rollouts.api.d.ts.map