export interface ExperimentVariant {
    id: string;
    name: string;
    weight: number;
    scoringConfigId?: string;
    evalEngine?: "llm" | "fast" | "auto";
    modelId?: string;
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
    uplift: number;
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
export interface RolloutStage {
    percent: number;
    durationHours: number;
    healthChecks: RolloutHealthCriteria;
}
export interface RolloutHealthCriteria {
    minConversionRate?: number;
    maxDismissalRate?: number;
    maxDivergence?: number;
    minSampleSize?: number;
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
export interface DriftThresholds {
    tierAgreementFloor: number;
    decisionAgreementFloor: number;
    maxCompositeDivergence: number;
    signalShiftThreshold: number;
    conversionRateDropPercent: number;
}
export type DriftAlertType = "tier_agreement_drop" | "decision_agreement_drop" | "divergence_spike" | "signal_shift" | "conversion_drop";
export type DriftSeverity = "warning" | "critical";
export type WindowType = "1h" | "6h" | "24h" | "7d";
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
//# sourceMappingURL=continuous-learning.d.ts.map