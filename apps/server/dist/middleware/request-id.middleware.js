import { randomBytes } from "crypto";
/**
 * Attaches `req.reqId` and echoes it as `X-Request-Id` in the response.
 * Reuses `x-request-id` from upstream (e.g. load balancer) when present.
 */
export function requestIdMiddleware(req, res, next) {
    const incoming = req.headers["x-request-id"];
    req.reqId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomBytes(8).toString("hex");
    res.setHeader("X-Request-Id", req.reqId);
    next();
}
//# sourceMappingURL=request-id.middleware.js.map