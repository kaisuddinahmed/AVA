import type { EvaluationResult } from "./evaluate.service.js";

export interface DecisionOutput {
  decision: "fire" | "suppress" | "queue";
  type: string | null;
  actionCode: string;
  frictionId: string;
  evaluationId: string;
}

/**
 * Combine MSWIM tier + LLM recommendation + gate overrides into final decision.
 */
export function makeDecision(evaluation: EvaluationResult): DecisionOutput {
  if (evaluation.decision === "suppress") {
    return {
      decision: "suppress",
      type: null,
      actionCode: "none",
      frictionId: evaluation.frictionIds[0] ?? "unknown",
      evaluationId: evaluation.evaluationId,
    };
  }

  // Map recommended action to action code
  const actionCode = evaluation.recommendedAction || mapTierToDefaultAction(evaluation.tier);
  const frictionId = evaluation.frictionIds[0] ?? "unknown";

  return {
    decision: evaluation.decision,
    type: evaluation.interventionType,
    actionCode,
    frictionId,
    evaluationId: evaluation.evaluationId,
  };
}

function mapTierToDefaultAction(tier: string): string {
  switch (tier) {
    case "PASSIVE":
      return "passive_info_adjust";
    case "NUDGE":
      return "nudge_suggestion";
    case "ACTIVE":
      return "active_comparison";
    case "ESCALATE":
      return "escalate_full_assist";
    default:
      return "none";
  }
}
