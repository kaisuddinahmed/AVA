// ============================================================================
// Jobs API — scheduled job management endpoints
// ============================================================================

import type { Request, Response } from "express";
import { JobRunRepo } from "@ava/db";
import { getJobRunner } from "../jobs/job-runner.js";
import { runDriftCheck } from "../jobs/drift-detector.js";
import { checkAllRolloutsHealth } from "../rollout/rollout-health.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

/**
 * GET /api/jobs/runs — List recent job runs
 */
export async function listJobRuns(req: Request, res: Response) {
  try {
    const {
      jobName,
      status,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const runs = await JobRunRepo.listJobRuns({
      jobName: jobName || undefined,
      status: status || undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({ runs });
  } catch (error) {
    log.error("[Jobs API] listJobRuns error:", error);
    res.status(500).json({ error: "Failed to list job runs" });
  }
}

/**
 * GET /api/jobs/runs/:id — Get specific run details
 */
export async function getJobRun(req: Request, res: Response) {
  try {
    const run = await JobRunRepo.getJobRun(String(req.params.id));
    if (!run) {
      return res.status(404).json({ error: "Job run not found" });
    }

    res.json({
      ...run,
      summary: run.summary ? JSON.parse(run.summary) : null,
    });
  } catch (error) {
    log.error("[Jobs API] getJobRun error:", error);
    res.status(500).json({ error: "Failed to get job run" });
  }
}

/**
 * POST /api/jobs/trigger — Trigger a job manually
 */
export async function triggerJob(req: Request, res: Response) {
  try {
    const { job } = req.body as { job: string };

    if (job === "nightly_batch") {
      const runner = getJobRunner();
      const result = await runner.runNow("api");
      res.json({ jobRunId: result.jobRunId, status: "completed" });
    } else if (job === "drift_check") {
      const jobRun = await JobRunRepo.createJobRun({
        jobName: "drift_check",
        triggeredBy: "api",
      });
      const startTime = Date.now();

      try {
        const result = await runDriftCheck();
        await JobRunRepo.completeJobRun(
          jobRun.id,
          result as unknown as Record<string, unknown>,
          Date.now() - startTime,
        );
        res.json({ jobRunId: jobRun.id, status: "completed", result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await JobRunRepo.failJobRun(jobRun.id, msg, Date.now() - startTime);
        throw err;
      }
    } else if (job === "rollout_health") {
      const jobRun = await JobRunRepo.createJobRun({
        jobName: "rollout_health",
        triggeredBy: "api",
      });
      const startTime = Date.now();

      try {
        await checkAllRolloutsHealth();
        await JobRunRepo.completeJobRun(
          jobRun.id,
          { checked: true },
          Date.now() - startTime,
        );
        res.json({ jobRunId: jobRun.id, status: "completed" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await JobRunRepo.failJobRun(jobRun.id, msg, Date.now() - startTime);
        throw err;
      }
    } else {
      res.status(400).json({
        error: `Unknown job: ${job}. Valid jobs: nightly_batch, drift_check, rollout_health`,
      });
    }
  } catch (error) {
    log.error("[Jobs API] triggerJob error:", error);
    res.status(500).json({ error: "Failed to trigger job" });
  }
}

/**
 * GET /api/jobs/next-run — Next scheduled nightly batch time
 */
export async function getNextRun(_req: Request, res: Response) {
  try {
    const runner = getJobRunner();
    const nextRun = runner.getNextRunTime();
    const lastRun = await JobRunRepo.getLastRun("nightly_batch");

    res.json({
      nextRun: nextRun.toISOString(),
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            completedAt: lastRun.completedAt,
            durationMs: lastRun.durationMs,
          }
        : null,
    });
  } catch (error) {
    log.error("[Jobs API] getNextRun error:", error);
    res.status(500).json({ error: "Failed to get next run time" });
  }
}
