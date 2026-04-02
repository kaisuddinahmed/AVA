import type { ExperimentVariant, ExperimentMetrics, ExperimentResult, SignificanceResult } from "@ava/shared";
/**
 * Compute per-variant metrics for an experiment.
 */
export declare function computeVariantMetrics(experimentId: string, variants: ExperimentVariant[]): Promise<ExperimentMetrics[]>;
/**
 * Two-proportion z-test for conversion rate difference.
 * Tests whether variant conversion rate differs from control.
 */
export declare function testSignificance(control: ExperimentMetrics, variant: ExperimentMetrics, confidenceLevel?: number): SignificanceResult;
/**
 * Compute full experiment results including significance.
 */
export declare function getExperimentResults(experimentId: string, variants: ExperimentVariant[]): Promise<ExperimentResult>;
//# sourceMappingURL=experiment-metrics.d.ts.map