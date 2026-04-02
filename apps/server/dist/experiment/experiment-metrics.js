// ============================================================================
// Experiment Metrics — per-variant aggregation + significance testing
// ============================================================================
import { ExperimentRepo } from "@ava/db";
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Compute per-variant metrics for an experiment.
 */
export async function computeVariantMetrics(experimentId, variants) {
    const variantOutcomes = await ExperimentRepo.getVariantOutcomes(experimentId);
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    const results = [];
    for (const vo of variantOutcomes) {
        const variant = variantMap.get(vo.variantId);
        const total = vo.total || 1; // avoid division by zero
        results.push({
            variantId: vo.variantId,
            variantName: variant?.name ?? vo.variantId,
            sampleSize: vo.total,
            conversionRate: vo.total > 0 ? vo.converted / total : 0,
            dismissalRate: vo.total > 0 ? vo.dismissed / total : 0,
            ignoreRate: vo.total > 0 ? vo.ignored / total : 0,
            avgCompositeScore: vo.avgCompositeScore,
            avgIntentScore: vo.avgIntentScore,
            avgFrictionScore: vo.avgFrictionScore,
        });
    }
    // Include variants with no data
    for (const variant of variants) {
        if (!results.find((r) => r.variantId === variant.id)) {
            results.push({
                variantId: variant.id,
                variantName: variant.name,
                sampleSize: 0,
                conversionRate: 0,
                dismissalRate: 0,
                ignoreRate: 0,
                avgCompositeScore: 0,
                avgIntentScore: 0,
                avgFrictionScore: 0,
            });
        }
    }
    return results;
}
/**
 * Two-proportion z-test for conversion rate difference.
 * Tests whether variant conversion rate differs from control.
 */
export function testSignificance(control, variant, confidenceLevel = 0.95) {
    const p1 = control.conversionRate;
    const p2 = variant.conversionRate;
    const n1 = control.sampleSize;
    const n2 = variant.sampleSize;
    // Need minimum sample size for meaningful test
    if (n1 < 10 || n2 < 10) {
        return {
            isSignificant: false,
            pValue: 1,
            zScore: 0,
            confidenceLevel,
            winningVariant: null,
            uplift: 0,
        };
    }
    // Pooled proportion
    const pPooled = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
    if (se === 0) {
        return {
            isSignificant: false,
            pValue: 1,
            zScore: 0,
            confidenceLevel,
            winningVariant: null,
            uplift: 0,
        };
    }
    const zScore = (p2 - p1) / se;
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore))); // two-tailed
    const alpha = 1 - confidenceLevel;
    const isSignificant = pValue < alpha;
    const uplift = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;
    let winningVariant = null;
    if (isSignificant) {
        winningVariant =
            p2 > p1 ? variant.variantId : control.variantId;
    }
    return {
        isSignificant,
        pValue: Math.round(pValue * 10000) / 10000,
        zScore: Math.round(zScore * 1000) / 1000,
        confidenceLevel,
        winningVariant,
        uplift: Math.round(uplift * 100) / 100,
    };
}
/**
 * Compute full experiment results including significance.
 */
export async function getExperimentResults(experimentId, variants) {
    const metrics = await computeVariantMetrics(experimentId, variants);
    // Find control (first variant by convention)
    const control = metrics[0];
    let significance = {
        isSignificant: false,
        pValue: 1,
        zScore: 0,
        confidenceLevel: 0.95,
        winningVariant: null,
        uplift: 0,
    };
    // Test each non-control variant against control
    if (metrics.length >= 2 && control) {
        // For simplicity, test the second variant (the treatment).
        // Multi-variant tests would need Bonferroni correction.
        significance = testSignificance(control, metrics[1]);
    }
    return {
        experimentId,
        variants: metrics,
        significance,
    };
}
// ---------------------------------------------------------------------------
// Normal CDF approximation
// Abramowitz and Stegun formula 7.1.26
// ---------------------------------------------------------------------------
function normalCDF(x) {
    if (x < -8)
        return 0;
    if (x > 8)
        return 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * y);
}
//# sourceMappingURL=experiment-metrics.js.map