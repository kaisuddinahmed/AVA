// ============================================================================
// Attribution resolver — Phase 4.1.
//
// Pure helper that decides whether an intervention about to be fired should
// be stamped with `recommendationId` + `experimentId`. Stamping happens ONLY
// when ALL FOUR Codex-mandated conditions hold:
//
//   1. The session has an active ExperimentAssignment for some experiment.id
//   2. That experiment.id matches the approvedExperimentId of some
//      Recommendation on this site.
//   3. The assigned variant === "treatment" (control arm never stamps —
//      that's the comparison baseline).
//   4. The fired frictionId AND actionCode both match the recommendation's
//      frictionId AND actionCode.
//
// Anything else → return null (no stamp). This guards against:
//   - Control-arm sessions being falsely attributed
//   - Other frictions firing during the same session bleeding into
//     attribution
//   - Different actionCodes / payloads firing on the same friction (e.g.
//     legacy fallback paths) being attributed to the recommendation
//
// All side effects (repo reads) are passed in via `deps` so this is
// node-testable without DOM/DB. The dispatcher (intervene.service) wires
// the real repos in production and the gate test mocks them.
// ============================================================================

export interface AttributionDeps {
  /** Look up the experiment+variant currently assigned to a session, or null. */
  getAssignmentForSession: (
    sessionId: string,
  ) => Promise<{ experimentId: string; variantId: string } | null>;
  /** Resolve experiment.id → linked Recommendation (or null when none). */
  getRecommendationForExperiment: (
    experimentId: string,
  ) => Promise<{ id: string; frictionId: string; actionCode: string } | null>;
}

export interface AttributionInput {
  sessionId: string;
  frictionId: string;
  actionCode: string;
}

export interface AttributionStamp {
  recommendationId: string;
  experimentId: string;
}

/**
 * Resolve attribution for a pending intervention. Returns the stamp to
 * apply or `null` if any of the four conditions fail.
 */
export async function resolveAttribution(
  input: AttributionInput,
  deps: AttributionDeps,
): Promise<AttributionStamp | null> {
  // Condition 1 — session must have an assignment.
  const assignment = await deps.getAssignmentForSession(input.sessionId);
  if (!assignment) return null;

  // Condition 3 — control arm never stamps. (Checked early — cheap.)
  if (assignment.variantId !== "treatment") return null;

  // Condition 2 — experiment must be backed by a Recommendation.
  const rec = await deps.getRecommendationForExperiment(assignment.experimentId);
  if (!rec) return null;

  // Condition 4 — friction AND action must both match the recommendation.
  if (rec.frictionId !== input.frictionId) return null;
  if (rec.actionCode !== input.actionCode) return null;

  return { recommendationId: rec.id, experimentId: assignment.experimentId };
}
