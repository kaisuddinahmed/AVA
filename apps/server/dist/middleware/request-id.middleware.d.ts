import type { Request, Response, NextFunction } from "express";
declare global {
    namespace Express {
        interface Request {
            reqId: string;
        }
    }
}
/**
 * Attaches `req.reqId` and echoes it as `X-Request-Id` in the response.
 * Reuses `x-request-id` from upstream (e.g. load balancer) when present.
 */
export declare function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=request-id.middleware.d.ts.map