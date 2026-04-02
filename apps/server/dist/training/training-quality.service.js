// ============================================================================
// Training Quality Filter Service — filters, scores, and stratifies training
// datapoints for high-quality fine-tuning datasets.
//
// Uses the quality flags captured by training-collector + signal-level checks
// to reject noisy, incomplete, or unreliable training examples.
// ============================================================================
import { TrainingDatapointRepo } from "@ava/db";
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
    minEventCount: 2,
    maxEventCount: 200,
    minSessionAgeSec: 10,
    maxSessionAgeSec: 7200,
    minNarrativeLength: 20,
    minClarityScore: 15,
    maxOutcomeDelayMs: 300_000,
    minCompositeScore: 5,
    requireFriction: false,
    validOutcomes: ["converted", "dismissed"],
};
// Quality score weights for grading
const QUALITY_WEIGHTS = {
    dataCompleteness: 0.25,
    signalConfidence: 0.25,
    outcomeReliability: 0.25,
    contextRichness: 0.25,
};
// Grade thresholds
const GRADE_THRESHOLDS = {
    high: 75,
    medium: 50,
    low: 25,
    // below 25 = rejected
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Assess quality of all datapoints matching the given filters.
 * Returns per-datapoint assessments and aggregate stats.
 */
export async function assessQuality(filters, thresholds) {
    const thresh = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const datapoints = await TrainingDatapointRepo.listDatapoints({
        outcome: filters.outcome,
        tier: filters.tier,
        siteUrl: filters.siteUrl,
        frictionId: filters.frictionId,
        interventionType: filters.interventionType,
        since: filters.since ? new Date(filters.since) : undefined,
        until: filters.until ? new Date(filters.until) : undefined,
        limit: filters.limit ?? 10000,
        offset: filters.offset ?? 0,
    });
    const assessments = [];
    const rejectionReasons = {};
    const gradeDistribution = {
        high: 0,
        medium: 0,
        low: 0,
        rejected: 0,
    };
    const outcomeStats = {};
    const tierStats = {};
    let qualityScoreSum = 0;
    for (const dp of datapoints) {
        const assessment = assessDatapoint(dp, thresh);
        assessments.push(assessment);
        gradeDistribution[assessment.grade]++;
        qualityScoreSum += assessment.score;
        // Track outcome pass rates
        if (!outcomeStats[dp.outcome])
            outcomeStats[dp.outcome] = { total: 0, passed: 0 };
        outcomeStats[dp.outcome].total++;
        if (assessment.grade !== "rejected")
            outcomeStats[dp.outcome].passed++;
        // Track tier pass rates
        if (!tierStats[dp.tier])
            tierStats[dp.tier] = { total: 0, passed: 0 };
        tierStats[dp.tier].total++;
        if (assessment.grade !== "rejected")
            tierStats[dp.tier].passed++;
        // Track rejection reasons
        if (assessment.grade === "rejected") {
            for (const check of assessment.checks) {
                if (!check.passed) {
                    rejectionReasons[check.check] = (rejectionReasons[check.check] || 0) + 1;
                }
            }
        }
    }
    const stats = {
        total: datapoints.length,
        gradeDistribution,
        rejectionReasons,
        avgQualityScore: datapoints.length > 0
            ? Math.round((qualityScoreSum / datapoints.length) * 10) / 10
            : 0,
        passRateByOutcome: Object.fromEntries(Object.entries(outcomeStats).map(([k, v]) => [
            k,
            { ...v, rate: v.total > 0 ? Math.round((v.passed / v.total) * 1000) / 10 : 0 },
        ])),
        passRateByTier: Object.fromEntries(Object.entries(tierStats).map(([k, v]) => [
            k,
            { ...v, rate: v.total > 0 ? Math.round((v.passed / v.total) * 1000) / 10 : 0 },
        ])),
    };
    return { assessments, stats };
}
/**
 * Get only the IDs of datapoints that pass quality checks at a given grade.
 * Useful for feeding into the formatter.
 */
export async function getQualifiedIds(filters, minGrade = "medium", thresholds) {
    const { assessments } = await assessQuality(filters, thresholds);
    const gradeRank = { high: 3, medium: 2, low: 1, rejected: 0 };
    const minRank = gradeRank[minGrade];
    return assessments
        .filter((a) => gradeRank[a.grade] >= minRank)
        .map((a) => a.datapointId);
}
/**
 * Get just the quality stats without full assessments (lightweight).
 */
export async function getQualityStats(filters, thresholds) {
    const { stats } = await assessQuality(filters, thresholds);
    return stats;
}
// ---------------------------------------------------------------------------
// Core assessment logic
// ---------------------------------------------------------------------------
function assessDatapoint(dp, thresh) {
    const checks = [];
    // Parse stored data
    let eventCount = 0;
    try {
        const events = JSON.parse(dp.rawEventData);
        eventCount = Array.isArray(events) ? events.length : 0;
    }
    catch {
        /* empty */
    }
    let frictionsFound = [];
    try {
        frictionsFound = JSON.parse(dp.frictionsFound);
    }
    catch {
        /* empty */
    }
    // === DATA COMPLETENESS CHECKS ===
    checks.push({
        check: "valid_outcome",
        passed: thresh.validOutcomes.includes(dp.outcome),
        reason: thresh.validOutcomes.includes(dp.outcome)
            ? undefined
            : `Outcome "${dp.outcome}" not in valid list`,
    });
    checks.push({
        check: "min_event_count",
        passed: eventCount >= thresh.minEventCount,
        reason: eventCount >= thresh.minEventCount
            ? undefined
            : `${eventCount} events < min ${thresh.minEventCount}`,
    });
    checks.push({
        check: "max_event_count",
        passed: eventCount <= thresh.maxEventCount,
        reason: eventCount <= thresh.maxEventCount
            ? undefined
            : `${eventCount} events > max ${thresh.maxEventCount} (possible bot)`,
    });
    checks.push({
        check: "narrative_present",
        passed: dp.narrative.length >= thresh.minNarrativeLength,
        reason: dp.narrative.length >= thresh.minNarrativeLength
            ? undefined
            : `Narrative ${dp.narrative.length} chars < min ${thresh.minNarrativeLength}`,
    });
    checks.push({
        check: "scores_valid",
        passed: isFiniteScore(dp.intentScore) &&
            isFiniteScore(dp.frictionScore) &&
            isFiniteScore(dp.clarityScore) &&
            isFiniteScore(dp.receptivityScore) &&
            isFiniteScore(dp.valueScore),
        reason: "One or more MSWIM scores are NaN or out of range",
    });
    // === SIGNAL CONFIDENCE CHECKS ===
    checks.push({
        check: "min_clarity_score",
        passed: dp.clarityScore >= thresh.minClarityScore,
        reason: dp.clarityScore >= thresh.minClarityScore
            ? undefined
            : `Clarity ${dp.clarityScore} < min ${thresh.minClarityScore}`,
    });
    checks.push({
        check: "min_composite_score",
        passed: dp.compositeScore >= thresh.minCompositeScore,
        reason: dp.compositeScore >= thresh.minCompositeScore
            ? undefined
            : `Composite ${dp.compositeScore} < min ${thresh.minCompositeScore}`,
    });
    if (thresh.requireFriction) {
        checks.push({
            check: "has_friction",
            passed: frictionsFound.length > 0,
            reason: frictionsFound.length > 0 ? undefined : "No frictions detected",
        });
    }
    // === OUTCOME RELIABILITY CHECKS ===
    checks.push({
        check: "session_age_min",
        passed: dp.sessionAgeSec >= thresh.minSessionAgeSec,
        reason: dp.sessionAgeSec >= thresh.minSessionAgeSec
            ? undefined
            : `Session age ${dp.sessionAgeSec}s < min ${thresh.minSessionAgeSec}s`,
    });
    checks.push({
        check: "session_age_max",
        passed: dp.sessionAgeSec <= thresh.maxSessionAgeSec,
        reason: dp.sessionAgeSec <= thresh.maxSessionAgeSec
            ? undefined
            : `Session age ${dp.sessionAgeSec}s > max ${thresh.maxSessionAgeSec}s`,
    });
    const outcomeDelayOk = dp.outcomeDelayMs == null || dp.outcomeDelayMs <= thresh.maxOutcomeDelayMs;
    checks.push({
        check: "outcome_delay",
        passed: outcomeDelayOk,
        reason: outcomeDelayOk
            ? undefined
            : `Outcome delay ${dp.outcomeDelayMs}ms > max ${thresh.maxOutcomeDelayMs}ms`,
    });
    // === CONTEXT RICHNESS (scored, not pass/fail) ===
    const contextScore = computeContextScore(dp, eventCount, frictionsFound);
    // === COMPUTE QUALITY SCORE ===
    const passedCount = checks.filter((c) => c.passed).length;
    const failedCount = checks.filter((c) => !c.passed).length;
    // Dimensional sub-scores
    const completenessScore = computeCompletenessScore(checks);
    const confidenceScore = computeConfidenceScore(dp);
    const reliabilityScore = computeReliabilityScore(dp, thresh);
    const qualityScore = Math.round(QUALITY_WEIGHTS.dataCompleteness * completenessScore +
        QUALITY_WEIGHTS.signalConfidence * confidenceScore +
        QUALITY_WEIGHTS.outcomeReliability * reliabilityScore +
        QUALITY_WEIGHTS.contextRichness * contextScore);
    // Determine grade
    let grade;
    // Hard reject if any critical check fails
    const criticalChecks = ["valid_outcome", "scores_valid", "min_event_count"];
    const hasCriticalFailure = checks.some((c) => criticalChecks.includes(c.check) && !c.passed);
    if (hasCriticalFailure) {
        grade = "rejected";
    }
    else if (qualityScore >= GRADE_THRESHOLDS.high) {
        grade = "high";
    }
    else if (qualityScore >= GRADE_THRESHOLDS.medium) {
        grade = "medium";
    }
    else if (qualityScore >= GRADE_THRESHOLDS.low) {
        grade = "low";
    }
    else {
        grade = "rejected";
    }
    return {
        datapointId: dp.id,
        grade,
        score: qualityScore,
        checks,
        passedCount,
        failedCount,
    };
}
// ---------------------------------------------------------------------------
// Sub-score calculators
// ---------------------------------------------------------------------------
function computeCompletenessScore(checks) {
    const completenessChecks = [
        "valid_outcome",
        "min_event_count",
        "narrative_present",
        "scores_valid",
    ];
    const relevant = checks.filter((c) => completenessChecks.includes(c.check));
    if (relevant.length === 0)
        return 50;
    const passed = relevant.filter((c) => c.passed).length;
    return Math.round((passed / relevant.length) * 100);
}
function computeConfidenceScore(dp) {
    // Clarity is the direct confidence measure. Boost if signals aren't degenerate.
    let score = dp.clarityScore;
    // Penalize if both intent and friction are very low (ambiguous session)
    if (dp.intentScore < 15 && dp.frictionScore < 15) {
        score = Math.max(0, score - 20);
    }
    // Penalize degenerate composites (all zeros or all 100s)
    if (dp.compositeScore < 5 || dp.compositeScore > 95) {
        score = Math.max(0, score - 10);
    }
    return Math.min(100, Math.max(0, score));
}
function computeReliabilityScore(dp, thresh) {
    let score = 70; // base
    // Session age: sweet spot 30s–1800s
    if (dp.sessionAgeSec < 10)
        score -= 30;
    else if (dp.sessionAgeSec < 30)
        score -= 15;
    else if (dp.sessionAgeSec > 3600)
        score -= 20;
    // Outcome delay: shorter = more causal
    if (dp.outcomeDelayMs != null) {
        if (dp.outcomeDelayMs < 5000)
            score += 15; // quick response
        else if (dp.outcomeDelayMs < 30000)
            score += 5;
        else if (dp.outcomeDelayMs > thresh.maxOutcomeDelayMs)
            score -= 30;
        else if (dp.outcomeDelayMs > 120000)
            score -= 10;
    }
    else {
        score -= 10; // no delay data
    }
    return Math.min(100, Math.max(0, score));
}
function computeContextScore(dp, eventCount, frictionsFound) {
    let score = 40; // base
    // More events = richer context (diminishing returns)
    if (eventCount >= 5)
        score += 15;
    else if (eventCount >= 3)
        score += 10;
    // Has friction signals
    if (frictionsFound.length > 0)
        score += 10;
    if (frictionsFound.length >= 3)
        score += 5;
    // Session with cart has commercial context
    if (dp.cartValue > 0)
        score += 10;
    // Logged-in or repeat visitors provide richer context
    if (dp.isLoggedIn)
        score += 5;
    if (dp.isRepeatVisitor)
        score += 5;
    // Known referrer type (not "direct")
    if (dp.referrerType !== "direct")
        score += 5;
    return Math.min(100, Math.max(0, score));
}
function isFiniteScore(val) {
    return Number.isFinite(val) && val >= 0 && val <= 100;
}
//# sourceMappingURL=training-quality.service.js.map