// ============================================================================
// Job Runner — setTimeout-based scheduler with drift correction.
// Runs the nightly batch, hourly snapshots, and canary health checks.
// ============================================================================
import { JobRunRepo } from "@ava/db";
import { config } from "../config.js";
import { runNightlyBatch } from "./nightly-batch.job.js";
import { computeWindowSnapshot } from "./drift-detector.js";
import { checkAllRolloutsHealth } from "../rollout/rollout-health.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "jobs" });
// ---------------------------------------------------------------------------
// Job Runner
// ---------------------------------------------------------------------------
export class JobRunner {
    nightlyTimer = null;
    hourlyTimer = null;
    canaryTimer = null;
    targetHourUTC;
    constructor(targetHourUTC) {
        this.targetHourUTC = targetHourUTC ?? config.jobs.nightlyHourUTC;
    }
    /**
     * Start all scheduled jobs.
     */
    start() {
        // 1. Nightly batch
        this.scheduleNightlyBatch();
        // 2. Hourly drift snapshots
        if (config.jobs.hourlySnapshotEnabled) {
            this.startHourlySnapshots();
        }
        // 3. Canary health checks (every N hours)
        this.startCanaryChecks();
    }
    /**
     * Stop all timers.
     */
    stop() {
        if (this.nightlyTimer) {
            clearTimeout(this.nightlyTimer);
            this.nightlyTimer = null;
        }
        if (this.hourlyTimer) {
            clearInterval(this.hourlyTimer);
            this.hourlyTimer = null;
        }
        if (this.canaryTimer) {
            clearInterval(this.canaryTimer);
            this.canaryTimer = null;
        }
    }
    /**
     * Trigger a nightly batch run immediately.
     */
    async runNow(triggeredBy = "api") {
        return this.executeNightlyBatch(triggeredBy);
    }
    /**
     * Get the next scheduled nightly batch time.
     */
    getNextRunTime() {
        const now = new Date();
        const next = new Date(now);
        next.setUTCHours(this.targetHourUTC, 0, 0, 0);
        if (next <= now) {
            next.setUTCDate(next.getUTCDate() + 1);
        }
        return next;
    }
    // ── Nightly batch ─────────────────────────────────────────────────────────
    scheduleNightlyBatch() {
        const msUntilTarget = this.calculateMsUntilTarget();
        log.info(`[JobRunner] Nightly batch scheduled for ${this.getNextRunTime().toISOString()} (${Math.round(msUntilTarget / 60000)} min)`);
        this.nightlyTimer = setTimeout(async () => {
            try {
                await this.executeNightlyBatch("scheduler");
            }
            catch (error) {
                log.error("[JobRunner] Nightly batch failed:", error);
            }
            // Re-schedule for the next day
            this.scheduleNightlyBatch();
        }, msUntilTarget);
    }
    async executeNightlyBatch(triggeredBy) {
        const startTime = Date.now();
        const jobRun = await JobRunRepo.createJobRun({
            jobName: "nightly_batch",
            triggeredBy,
        });
        try {
            const result = await runNightlyBatch();
            const durationMs = Date.now() - startTime;
            await JobRunRepo.completeJobRun(jobRun.id, result, durationMs);
            log.info(`[JobRunner] Nightly batch completed in ${durationMs}ms (${result.subtasks.length} subtasks, ${result.errors.length} errors)`);
            return { jobRunId: jobRun.id, result: result };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            await JobRunRepo.failJobRun(jobRun.id, errorMsg, durationMs);
            throw error;
        }
    }
    calculateMsUntilTarget() {
        const now = Date.now();
        const next = this.getNextRunTime().getTime();
        return next - now;
    }
    // ── Hourly snapshots ──────────────────────────────────────────────────────
    startHourlySnapshots() {
        const HOUR_MS = 60 * 60 * 1000;
        this.hourlyTimer = setInterval(async () => {
            try {
                await computeWindowSnapshot("1h");
                log.info("[JobRunner] Hourly drift snapshot computed");
            }
            catch (error) {
                log.error("[JobRunner] Hourly snapshot failed:", error);
            }
        }, HOUR_MS);
        log.info("[JobRunner] Hourly drift snapshots enabled");
    }
    // ── Canary health checks ──────────────────────────────────────────────────
    startCanaryChecks() {
        const intervalMs = config.jobs.canaryCheckIntervalHours * 60 * 60 * 1000;
        this.canaryTimer = setInterval(async () => {
            try {
                await checkAllRolloutsHealth();
                log.info("[JobRunner] Canary health check completed");
            }
            catch (error) {
                log.error("[JobRunner] Canary health check failed:", error);
            }
        }, intervalMs);
        log.info(`[JobRunner] Canary health checks every ${config.jobs.canaryCheckIntervalHours}h`);
    }
}
// ---------------------------------------------------------------------------
// Convenience: singleton for server use
// ---------------------------------------------------------------------------
let _instance = null;
export function getJobRunner() {
    if (!_instance) {
        _instance = new JobRunner();
    }
    return _instance;
}
//# sourceMappingURL=job-runner.js.map