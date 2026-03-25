// ============================================================================
// Continuous Learning — shared types for experiments, rollouts, drift detection
// ============================================================================

// ── Experiment Types ────────────────────────────────────────────────────────

export interface ExperimentVariant {
  id: string;
  name: string; // "control" | "variant_a" | "variant_b" etc.
  weight: number; // 0.0-1.0, must sum to 1.0 across variants
  scoringConfigId?: string;
  evalEngine?: "llm" | "fast" | "auto";
  modelId?: string; // Fine-tuned model ID for A/B testing models
}

export interface ExperimentMetrics {
  variantId: string;
  variantName: string;
  sampleSize: number;
  conversionRate: number;
  dismissalRate: number;
  ignoreRate: number;
  avgCompositeScore: number;
  avgIntentScore: number;
  avgFrictionScore: number;
}

export interface SignificanceResult {
  isSignificant: boolean;
  pValue: number;
  zScore: number;
  confidenceLevel: number;
  winningVariant: string | null;
  uplift: number; // % improvement over control
}

export interface ExperimentResult {
  experimentId: string;
  variants: ExperimentMetrics[];
  significance: SignificanceResult;
}

export interface ExperimentOverrides {
  experimentId: string;
  variantId: string;
  evalEngine?: "llm" | "fast" | "auto";
  scoringConfigId?: string;
  modelId?: string;
}

// ── Rollout Types ───────────────────────────────────────────────────────────

export interface RolloutStage {
  percent: number; // traffic percentage (5, 25, 50, 100)
  durationHours: number; // min hours before auto-promote
  healthChecks: RolloutHealthCriteria;
}

export interface RolloutHealthCriteria {
  minConversionRate?: number; // e.g. 0.10 = 10%
  maxDismissalRate?: number; // e.g. 0.70 = 70%
  maxDivergence?: number; // max composite divergence vs baseline
  minSampleSize?: number; // minimum observations before judging
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: HealthCheckEntry[];
  recommendation: "promote" | "hold" | "rollback";
}

export interface HealthCheckEntry {
  name: string;
  passed: boolean;
  expected: number;
  actual: number;
}

// ── Drift Types ─────────────────────────────────────────────────────────────

export interface DriftThresholds {
  tierAgreementFloor: number; // e.g. 0.70 = 70% agreement minimum
  decisionAgreementFloor: number; // e.g. 0.75
  maxCompositeDivergence: number; // e.g. 15 points
  signalShiftThreshold: number; // e.g. 10 points avg shift
  conversionRateDropPercent: number; // e.g. 0.20 = 20% relative drop
}

export type DriftAlertType =
  | "tier_agreement_drop"
  | "decision_agreement_drop"
  | "divergence_spike"
  | "signal_shift"
  | "conversion_drop";

export type DriftSeverity = "warning" | "critical";

export type WindowType = "1h" | "6h" | "24h" | "7d";

// ── Job Types ───────────────────────────────────────────────────────────────

export interface SubtaskResult {
  name: string;
  status: "completed" | "failed" | "skipped";
  durationMs: number;
  summary: Record<string, unknown>;
  error?: string;
}

export interface NightlyBatchResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  subtasks: SubtaskResult[];
  errors: string[];
}
