import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { httpLoggerMiddleware } from "./middleware/http-logger.middleware.js";
import { createWSServer } from "./broadcast/ws-server.js";
import { apiRouter } from "./api/routes.js";
import { getJobRunner } from "./jobs/job-runner.js";
const log = logger.child({ service: "server" });
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// API routes
app.use("/api", apiRouter);
// Start HTTP server
app.listen(config.port, () => {
    log.info({ port: config.port }, `HTTP server running on port ${config.port}`);
});
// Start WebSocket server
const wss = createWSServer(config.wsPort);
log.info({ port: config.wsPort }, `WebSocket server running on port ${config.wsPort}`);
// Start scheduled job runner (nightly batch, drift snapshots, canary checks)
if (!config.jobs.disableScheduler) {
    const jobRunner = getJobRunner();
    jobRunner.start();
    log.info({ nextRun: jobRunner.getNextRunTime().toISOString() }, `Job scheduler started — next nightly batch: ${jobRunner.getNextRunTime().toISOString()}`);
}
else {
    log.info("Job scheduler disabled (DISABLE_SCHEDULER=true)");
}
export { app, wss };
//# sourceMappingURL=index.js.map