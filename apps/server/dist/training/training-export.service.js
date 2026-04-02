// ============================================================================
// Training Export Service — exports TrainingDatapoints as JSONL or CSV
// Supports filtering, formatting for fine-tuning, and summary stats.
// ============================================================================
import { TrainingDatapointRepo } from "@ava/db";
// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------
/**
 * Export training datapoints as an array of FineTuningRecords.
 */
export async function exportAsRecords(filters) {
    const datapoints = await TrainingDatapointRepo.listDatapoints({
        outcome: filters.outcome,
        tier: filters.tier,
        siteUrl: filters.siteUrl,
        frictionId: filters.frictionId,
        interventionType: filters.interventionType,
        since: filters.since ? new Date(filters.since) : undefined,
        until: filters.until ? new Date(filters.until) : undefined,
        limit: filters.limit ?? 1000,
        offset: filters.offset ?? 0,
    });
    return datapoints.map(toFineTuningRecord);
}
/**
 * Export as JSONL string (one JSON object per line).
 * Standard format for fine-tuning pipelines.
 */
export async function exportAsJsonl(filters) {
    const records = await exportAsRecords(filters);
    return records.map((r) => JSON.stringify(r)).join("\n");
}
/**
 * Export as CSV string.
 * Flattened format for spreadsheet analysis / quick inspection.
 */
export async function exportAsCsv(filters) {
    const datapoints = await TrainingDatapointRepo.listDatapoints({
        outcome: filters.outcome,
        tier: filters.tier,
        siteUrl: filters.siteUrl,
        frictionId: filters.frictionId,
        interventionType: filters.interventionType,
        since: filters.since ? new Date(filters.since) : undefined,
        until: filters.until ? new Date(filters.until) : undefined,
        limit: filters.limit ?? 1000,
        offset: filters.offset ?? 0,
    });
    if (datapoints.length === 0)
        return "";
    const headers = [
        "id",
        "createdAt",
        "sessionId",
        "siteUrl",
        "deviceType",
        "referrerType",
        "isLoggedIn",
        "isRepeatVisitor",
        "cartValue",
        "cartItemCount",
        "sessionAgeSec",
        "pageType",
        "intentScore",
        "frictionScore",
        "clarityScore",
        "receptivityScore",
        "valueScore",
        "compositeScore",
        "tier",
        "decision",
        "gateOverride",
        "interventionType",
        "actionCode",
        "frictionId",
        "mswimScoreAtFire",
        "tierAtFire",
        "outcome",
        "conversionAction",
        "outcomeDelayMs",
        "totalInterventionsFired",
        "totalDismissals",
        "totalConversions",
        "frictionsFound",
    ];
    const rows = datapoints.map((dp) => [
        dp.id,
        dp.createdAt.toISOString(),
        dp.sessionId,
        csvEscape(dp.siteUrl),
        dp.deviceType,
        dp.referrerType,
        dp.isLoggedIn,
        dp.isRepeatVisitor,
        dp.cartValue,
        dp.cartItemCount,
        dp.sessionAgeSec,
        dp.pageType,
        dp.intentScore,
        dp.frictionScore,
        dp.clarityScore,
        dp.receptivityScore,
        dp.valueScore,
        dp.compositeScore,
        dp.tier,
        dp.decision,
        dp.gateOverride ?? "",
        dp.interventionType,
        dp.actionCode,
        dp.frictionId,
        dp.mswimScoreAtFire,
        dp.tierAtFire,
        dp.outcome,
        dp.conversionAction ?? "",
        dp.outcomeDelayMs ?? "",
        dp.totalInterventionsFired,
        dp.totalDismissals,
        dp.totalConversions,
        csvEscape(dp.frictionsFound),
    ].join(","));
    return [headers.join(","), ...rows].join("\n");
}
/**
 * Get summary statistics for the training dataset (with optional filters).
 */
export async function getExportStats(filters) {
    const [totalDatapoints, datapoints] = await Promise.all([
        TrainingDatapointRepo.countDatapoints(),
        TrainingDatapointRepo.listDatapoints({
            outcome: filters.outcome,
            tier: filters.tier,
            siteUrl: filters.siteUrl,
            frictionId: filters.frictionId,
            interventionType: filters.interventionType,
            since: filters.since ? new Date(filters.since) : undefined,
            until: filters.until ? new Date(filters.until) : undefined,
            limit: filters.limit ?? 10000,
            offset: 0,
        }),
    ]);
    const outcomeDistribution = {};
    const tierDistribution = {};
    let compositeSum = 0;
    let delaySum = 0;
    let delayCount = 0;
    let earliest = null;
    let latest = null;
    for (const dp of datapoints) {
        outcomeDistribution[dp.outcome] =
            (outcomeDistribution[dp.outcome] || 0) + 1;
        tierDistribution[dp.tier] = (tierDistribution[dp.tier] || 0) + 1;
        compositeSum += dp.compositeScore;
        if (dp.outcomeDelayMs != null) {
            delaySum += dp.outcomeDelayMs;
            delayCount++;
        }
        if (!earliest || dp.createdAt < earliest)
            earliest = dp.createdAt;
        if (!latest || dp.createdAt > latest)
            latest = dp.createdAt;
    }
    return {
        totalDatapoints,
        filteredCount: datapoints.length,
        outcomeDistribution,
        tierDistribution,
        avgCompositeScore: datapoints.length > 0
            ? Math.round((compositeSum / datapoints.length) * 100) / 100
            : 0,
        avgOutcomeDelayMs: delayCount > 0 ? Math.round(delaySum / delayCount) : null,
        dateRange: {
            earliest: earliest?.toISOString() ?? null,
            latest: latest?.toISOString() ?? null,
        },
    };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function toFineTuningRecord(dp) {
    let events = [];
    try {
        events = JSON.parse(dp.rawEventData);
    }
    catch {
        // keep empty
    }
    let frictionsFound = [];
    try {
        frictionsFound = JSON.parse(dp.frictionsFound);
    }
    catch {
        // keep empty
    }
    let weightsUsed = {};
    try {
        weightsUsed = JSON.parse(dp.weightsUsed);
    }
    catch {
        // keep empty
    }
    return {
        input: {
            sessionContext: {
                deviceType: dp.deviceType,
                referrerType: dp.referrerType,
                isLoggedIn: dp.isLoggedIn,
                isRepeatVisitor: dp.isRepeatVisitor,
                cartValue: dp.cartValue,
                cartItemCount: dp.cartItemCount,
                sessionAgeSec: dp.sessionAgeSec,
                totalInterventionsFired: dp.totalInterventionsFired,
                totalDismissals: dp.totalDismissals,
                totalConversions: dp.totalConversions,
            },
            events,
            pageType: dp.pageType,
        },
        output: {
            narrative: dp.narrative,
            frictionsFound,
            scores: {
                intent: dp.intentScore,
                friction: dp.frictionScore,
                clarity: dp.clarityScore,
                receptivity: dp.receptivityScore,
                value: dp.valueScore,
            },
        },
        decision: {
            compositeScore: dp.compositeScore,
            tier: dp.tier,
            decision: dp.decision,
            gateOverride: dp.gateOverride,
            interventionType: dp.interventionType,
            actionCode: dp.actionCode,
            frictionId: dp.frictionId,
        },
        outcome: {
            label: dp.outcome,
            conversionAction: dp.conversionAction,
            outcomeDelayMs: dp.outcomeDelayMs,
        },
        meta: {
            datapointId: dp.id,
            sessionId: dp.sessionId,
            evaluationId: dp.evaluationId,
            interventionId: dp.interventionId,
            siteUrl: dp.siteUrl,
            createdAt: dp.createdAt.toISOString(),
            weightsUsed,
            mswimScoreAtFire: dp.mswimScoreAtFire,
            tierAtFire: dp.tierAtFire,
        },
    };
}
function csvEscape(value) {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
//# sourceMappingURL=training-export.service.js.map