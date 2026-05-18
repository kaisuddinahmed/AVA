// ============================================================================
// confidence-tier — Codex review follow-up (post-Phase 4).
//
// Pure helper for the InterveneTab ConfidenceChip. Extracted so the
// classification logic is unit-testable without React/DOM. The chip
// presentation itself stays in InterveneTab.tsx; this file is just the
// rule.
//
// Buckets (rules-based / learning / learned) exist to address Codex's
// feedback: without this distinction, a brand-new merchant's 25-sample
// suggestion looks identical to a 1000-sample statistically-significant
// ship recommendation, eroding merchant trust.
// ============================================================================

export type ConfidenceTier = "rules" | "learning" | "learned";

export interface ConfidenceInput {
  confidence: number;
  sampleSizeBasis: number;
}

export interface OutcomeInput {
  significant?: boolean;
  variantSessions: number;
  controlSessions: number;
}

/**
 * Classify a recommendation. Outcome data (when present) takes precedence
 * over the engine's pre-experiment confidence/sample, because real
 * conversions on the merchant's store are the strongest signal.
 */
export function classifyConfidence(
  rec: ConfidenceInput,
  outcome?: OutcomeInput | null,
): ConfidenceTier {
  if (outcome) {
    const totalSessions = outcome.variantSessions + outcome.controlSessions;
    if (outcome.significant && totalSessions >= 100) return "learned";
    if (totalSessions < 50) return "rules";
    return "learning";
  }
  if (rec.confidence < 0.5 || rec.sampleSizeBasis < 50) return "rules";
  if (rec.confidence >= 0.7 && rec.sampleSizeBasis >= 100) return "learned";
  return "learning";
}
