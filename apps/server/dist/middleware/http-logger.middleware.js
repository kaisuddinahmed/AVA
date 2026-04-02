import { logger } from "../logger.js";
const log = logger.child({ service: "http" });
export function httpLoggerMiddleware(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
        const durationMs = Date.now() - start;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        log[level]({
            reqId: req.reqId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs,
        }, `${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    });
    next();
}
//# sourceMappingURL=http-logger.middleware.js.map