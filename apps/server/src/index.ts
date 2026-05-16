import { config } from "./config.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { createWSServer } from "./broadcast/ws-server.js";
import { getJobRunner } from "./jobs/job-runner.js";
import { SiteConfigRepo } from "@ava/db";

const log = logger.child({ service: "server" });

const app = createApp();

// Start HTTP server
app.listen(config.port, () => {
  log.info({ port: config.port }, `HTTP server running on port ${config.port}`);
  // Reset demo site to dormant on every startup so the widget stays hidden
  // until the wizard activates it — regardless of what was left in the DB.
  const DEMO_SITE_KEY = "avak_eff0c37fabe8d527";
  SiteConfigRepo.getSiteConfigBySiteKey(DEMO_SITE_KEY)
    .then((site) => {
      if (!site) return;
      return SiteConfigRepo.setIntegrationStatus(site.id, "analyzing", null);
    })
    .then(() => log.info("Demo site reset to dormant on startup"))
    .catch((err) => log.warn({ err }, "Demo site startup reset failed (non-fatal)"));
});

// Start WebSocket server
const wss = createWSServer(config.wsPort);
log.info({ port: config.wsPort }, `WebSocket server running on port ${config.wsPort}`);

// Start scheduled job runner (nightly batch, drift snapshots, canary checks)
if (!config.jobs.disableScheduler) {
  const jobRunner = getJobRunner();
  jobRunner.start();
  log.info(
    { nextRun: jobRunner.getNextRunTime().toISOString() },
    `Job scheduler started — next nightly batch: ${jobRunner.getNextRunTime().toISOString()}`,
  );
} else {
  log.info("Job scheduler disabled (DISABLE_SCHEDULER=true)");
}

export { app, wss };
