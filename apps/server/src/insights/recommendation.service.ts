// ============================================================================
// Recommendation service — Phase 3.2 lifecycle (approve / reject / regenerate).
//
// Sits between the API handlers and the repository + experiment service.
// Owns the "approve → auto-create Experiment" rule that powers the
// INTERVENE control-room flow:
//
//   merchant clicks Approve  →  service creates a 2-variant Experiment
//                            →  links Experiment.id to the Recommendation
//                            →  Recommendation flips to `approved`
//
// The Experiment itself uses the existing SHA-256 split assigner — we do
// NOT touch traffic routing here, just declare the variants.
// ============================================================================

import { RecommendationRepo } from "@ava/db";
import {
  createExperiment,
  startExperiment,
  endExperiment,
  getExperiment,
} from "../experiment/experiment.service.js";
import {
  generateAndPersist,
  type GenerateOptions,
} from "./recommendation-engine.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "recommendation.service" });

// ---------------------------------------------------------------------------
// Approve — create Experiment + link
// ---------------------------------------------------------------------------

export interface ApproveOptions {
  /** Optional override for traffic split. Defaults to 50/50. */
  trafficPercent?: number;
  /** Auto-start the experiment after creation. Defaults to true. */
  autoStart?: boolean;
}

/**
 * Approve a pending Recommendation. Idempotent: if already approved, returns
 * the existing record without creating a duplicate Experiment.
 */
export async function approveRecommendation(
  id: string,
  opts: ApproveOptions = {},
) {
  const rec = await RecommendationRepo.getRecommendation(id);
  if (!rec) throw new Error(`Recommendation ${id} not found`);

  // Idempotency: already approved → return as-is.
  if (rec.status === "approved" || rec.status === "active") {
    log.info({ id, status: rec.status }, "[Recommendation] already approved — no-op");
    return rec;
  }

  if (rec.status !== "pending") {
    throw new Error(
      `Cannot approve Recommendation in ${rec.status} status (must be pending)`,
    );
  }

  // Build the Experiment variants: control (do nothing extra) vs.
  // treatment (apply the recommended actionCode + payload).
  const experiment = await createExperiment({
    name: `Rec ${rec.frictionId} → ${rec.actionCode}`,
    description:
      `Auto-created from Recommendation ${rec.id}. ${rec.rationale}`,
    siteUrl: rec.siteUrl,
    trafficPercent: opts.trafficPercent ?? 100,
    // Variants are pure traffic-split definitions. The intervention payload
    // (actionCode + payloadTemplate + interventionType) lives on the
    // Recommendation row, looked up via Recommendation.approvedExperimentId.
    variants: [
      { id: "control", name: "control", weight: 0.5 },
      { id: "treatment", name: "treatment", weight: 0.5 },
    ],
    primaryMetric: "conversion_rate",
    minSampleSize: 100,
  });

  // Codex P1 #2 — atomic claim. updateMany returns count=1 only if the
  // recommendation was still `pending` at the moment we wrote. If two
  // approve requests race, exactly one wins; the loser ends its orphan
  // experiment and returns the already-approved row.
  const claim = await RecommendationRepo.approveIfPending(rec.id, experiment.id);
  if (claim.count === 0) {
    log.warn(
      { id, orphanExperimentId: experiment.id },
      "[Recommendation] approve race lost — cleaning up orphan experiment",
    );
    try { await endExperiment(experiment.id); }
    catch (err) {
      log.warn(
        { id, orphanExperimentId: experiment.id, err: err instanceof Error ? err.message : String(err) },
        "[Recommendation] orphan experiment cleanup failed",
      );
    }
    const current = await RecommendationRepo.getRecommendation(rec.id);
    return current ?? rec;
  }

  // Re-fetch the now-approved row (updateMany doesn't return the record).
  const approved = (await RecommendationRepo.getRecommendation(rec.id)) ?? rec;

  // Auto-start unless caller opted out.
  if (opts.autoStart !== false) {
    try {
      await startExperiment(experiment.id);
    } catch (err) {
      // If start fails (e.g. another experiment is already running on the
      // site), surface it but don't unwind the approval — merchant can
      // start it manually once the conflict clears.
      log.warn(
        { id, experimentId: experiment.id, err: err instanceof Error ? err.message : String(err) },
        "[Recommendation] experiment auto-start failed — left in draft",
      );
    }
  }

  log.info(
    { id, experimentId: experiment.id, frictionId: rec.frictionId },
    "[Recommendation] approved + experiment created",
  );
  return approved;
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export interface RejectOptions {
  reason: string;
}

export async function rejectRecommendation(id: string, opts: RejectOptions) {
  const rec = await RecommendationRepo.getRecommendation(id);
  if (!rec) throw new Error(`Recommendation ${id} not found`);

  if (rec.status === "rejected" || rec.status === "archived") {
    return rec; // idempotent
  }
  if (rec.status !== "pending") {
    throw new Error(
      `Cannot reject Recommendation in ${rec.status} status (must be pending)`,
    );
  }

  const reason = opts.reason?.trim();
  if (!reason) throw new Error("Rejection reason is required");

  const rejected = await RecommendationRepo.reject(rec.id, reason);
  log.info(
    { id, frictionId: rec.frictionId, reason },
    "[Recommendation] rejected by merchant",
  );
  return rejected;
}

// ---------------------------------------------------------------------------
// Regenerate (on-demand)
// ---------------------------------------------------------------------------

/**
 * Trigger an immediate regeneration pass for a site. Returns the persisted
 * Recommendation rows. The nightly job calls this on a schedule; the API
 * exposes it for "refresh" buttons in the dashboard.
 */
export async function regenerateForSite(opts: GenerateOptions) {
  const persisted = await generateAndPersist(opts);
  log.info(
    { siteUrl: opts.siteUrl, produced: persisted.length },
    "[Recommendation] on-demand regeneration complete",
  );
  return persisted;
}

// ---------------------------------------------------------------------------
// Get with linked experiment (for the approval-card UI)
// ---------------------------------------------------------------------------

export async function getWithExperiment(id: string) {
  const rec = await RecommendationRepo.getRecommendation(id);
  if (!rec) return null;
  if (!rec.approvedExperimentId) return { ...rec, experiment: null };
  const experiment = await getExperiment(rec.approvedExperimentId);
  return { ...rec, experiment };
}
