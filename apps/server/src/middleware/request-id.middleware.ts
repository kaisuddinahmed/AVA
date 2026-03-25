// ============================================================================
// Request ID Middleware — attaches a correlation ID to every HTTP request.
// The ID flows through logs so a single request can be traced end-to-end.
// ============================================================================
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  req.reqId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", req.reqId);
  next();
}
