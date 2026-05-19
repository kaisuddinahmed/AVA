// ============================================================================
// visitor-mind-updater — populates VisitorMind from each new EvaluationResult.
//
// Closes Codex P1.2 (2026-05-19): without this, VisitorMind is read by
// think/ but never written by production code, so the salesperson's
// "mind" stays empty.
//
// Derivations are deliberately simple — the rules can be tuned later, but
// the wire-up must exist so the loop actually flows. Specifically:
//
//   - mood        — from MSWIM composite + friction + exit-intent signals
//   - decisionPressure — from composite (close proxy for "ready to decide")
//   - priceSensitivity — from price-related friction IDs / events
//   - inferredObjections — from friction IDs that map cleanly to types
//   - persona — best-effort from referrer + repeat-visitor + cart shape
//
// All writes are best-effort: errors are logged but never block evaluate.
// ============================================================================

import { VisitorMindRepo } from "@ava/db";
import { logger } from "../logger.js";
import type { EvaluationResult } from "./evaluate.service.js";

const log = logger.child({ service: "visitor-mind-updater" });

// Friction IDs that strongly indicate a specific objection category.
const FRICTION_TO_OBJECTION: Record<string, "price" | "fit" | "trust" | "delivery" | "choice" | "timing"> = {
  // Price
  F060: "price",
  F099: "price",
  F117: "price",
  F128: "price",
  F283: "price",
  F284: "price",
  // Fit
  F328: "fit",
  F036: "fit", // returns-search often == fit anxiety
  // Trust
  F094: "trust",
  F089: "trust",
  // Delivery
  F100: "delivery",
  F329: "delivery",
  F330: "delivery",
  // Choice
  F042: "choice",
  F301: "choice",
  F326: "choice",
  F334: "choice",
  // Timing
  F068: "timing",
  F069: "timing",
  F002: "timing",
};

export interface UpdateInput {
  sessionId: string;
  siteUrl: string;
  result: EvaluationResult;
  events?: Array<{
    eventType?: string;
    frictionId?: string | null;
    rawSignals?: Record<string, unknown>;
  }>;
}

/**
 * Apply derivations from one evaluation to VisitorMind. Fire-and-forget
 * compatible — errors are swallowed by the outer caller (evaluate.service).
 */
export async function updateVisitorMindFromEvaluation(
  input: UpdateInput,
): Promise<void> {
  const { sessionId, siteUrl, result, events = [] } = input;

  try {
    // 1) Mood transition from the new tier + composite.
    const mood = deriveMood(result, events);
    if (mood) {
      await VisitorMindRepo.recordMoodTransition(
        sessionId,
        siteUrl,
        mood,
        `tier=${result.tier} composite=${Math.round(result.compositeScore)}`,
      );
    }

    // 2) Scalar updates — bounded 0..100 by the repo.
    await VisitorMindRepo.updateScalar(sessionId, siteUrl, {
      decisionPressure: result.compositeScore,
      priceSensitivity: derivePriceSensitivity(result, events),
      confidence: deriveConfidence(result),
      lastEvaluationId: result.evaluationId,
      // evaluationsConsidered intentionally not incremented here; the
      // repo's existing rows carry the count and this updater is called
      // once per evaluation.
    });

    // 3) Inferred objections from friction IDs that have a clean mapping.
    for (const frictionId of result.frictionIds) {
      const type = FRICTION_TO_OBJECTION[frictionId];
      if (!type) continue;
      const confidence = clampUnit((result.signals.friction ?? 0) / 100);
      await VisitorMindRepo.addInferredObjection(sessionId, siteUrl, {
        type,
        confidence,
        evidence: [frictionId],
      });
    }
  } catch (err) {
    log.warn(
      {
        sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "[visitor-mind-updater] write failed — leaving mind unchanged",
    );
  }
}

// ---------------------------------------------------------------------------
// Derivations — kept small and intentional. Tune as data arrives.
// ---------------------------------------------------------------------------

type Mood = "confident" | "engaged" | "hesitant" | "frustrated" | "leaving";

function deriveMood(
  result: EvaluationResult,
  events: ReadonlyArray<{ eventType?: string }>,
): Mood | null {
  const friction = result.signals.friction ?? 0;
  const composite = result.compositeScore;

  // Leaving — strongest signal first.
  if (events.some((e) => e.eventType === "exit_intent")) return "leaving";
  if (result.tier === "ESCALATE" && friction >= 70) return "leaving";

  // Frustrated — high friction trumps composite.
  if (friction >= 75) return "frustrated";

  // Engaged / confident — high composite, low friction.
  if (composite >= 70 && friction < 40) return "confident";
  if (composite >= 55) return "engaged";

  // Hesitant — mid composite, mid-to-high friction.
  if (composite < 55 && friction >= 40) return "hesitant";

  return null; // not a strong enough signal to transition
}

/**
 * 0..100 — bumped by price-coded frictions and price-related events.
 * Returns null when we have no signal (caller will skip the update).
 */
function derivePriceSensitivity(
  result: EvaluationResult,
  events: ReadonlyArray<{ eventType?: string; frictionId?: string | null }>,
): number {
  let score = 50; // neutral baseline
  for (const f of result.frictionIds) {
    if (FRICTION_TO_OBJECTION[f] === "price") score += 10;
  }
  for (const e of events) {
    if (e.eventType === "element_reread") score += 5;
    if (e.eventType === "price_copy") score += 8;
    if (e.frictionId === "F060" || e.frictionId === "F117") score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

function deriveConfidence(result: EvaluationResult): number {
  // High-friction LLM evaluations are higher-confidence reads; fast/zero
  // friction reads are lower-confidence. Scale to 0..100.
  const engineBoost = result.engine === "llm" ? 20 : 0;
  const frictionWeight = Math.min(60, result.signals.friction * 0.6);
  return Math.min(100, Math.max(0, engineBoost + frictionWeight + 20));
}

function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}
