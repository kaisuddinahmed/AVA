// ============================================================================
// Retrain Trigger Service — checks conditions and fires retraining
// Called from nightly batch after eval_harness and drift_alerts.
// ============================================================================
import { DriftAlertRepo, TrainingDatapointRepo, RetrainTriggerRepo } from "@ava/db";
import { config } from "../config.js";
import { submitFineTuneJob } from "./fine-tune-submit.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "training" });
/**
 * Check if automated retraining should be triggered.
 * Conditions (any one fires the trigger):
 * 1. Critical drift alerts in last 24h
 * 2. Eval harness regression detected (passed as param from nightly batch)
 * 3. Training data volume ≥ minDatapoints since last retrain
 *
 * Guard rails:
 * - retrain.autoEnabled must be true
 * - Minimum interval of retrain.minIntervalDays since last trigger
 * - No active (in-progress) retrain trigger
 */
export async function checkRetrainTriggers(evalRegressionDetected = false) {
    const reasons = [];
    // Guard: auto-retrain disabled
    if (!config.retrain.autoEnabled) {
        return { triggered: false, reasons: ["auto_retrain_disabled"] };
    }
    // Guard: active trigger in progress
    const activeTrigger = await RetrainTriggerRepo.getActiveTrigger();
    if (activeTrigger) {
        return { triggered: false, reasons: [`active_trigger_in_progress:${activeTrigger.id}`] };
    }
    // Guard: minimum interval
    const lastTrigger = await RetrainTriggerRepo.getLastTrigger();
    if (lastTrigger) {
        const daysSinceLast = (Date.now() - lastTrigger.triggeredAt.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceLast < config.retrain.minIntervalDays) {
            return { triggered: false, reasons: [`min_interval_not_met:${daysSinceLast.toFixed(1)}d`] };
        }
    }
    // Condition 1: Critical drift alerts in last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAlerts = await DriftAlertRepo.listAlerts({ limit: 100 });
    const criticalRecent = (recentAlerts ?? []).filter((a) => a.severity === "critical" && new Date(a.createdAt) > yesterday && !a.acknowledged);
    if (criticalRecent.length > 0) {
        reasons.push(`critical_drift_alerts:${criticalRecent.length}`);
    }
    // Condition 2: Eval harness regression
    if (evalRegressionDetected) {
        reasons.push("eval_harness_regression");
    }
    // Condition 3: Data volume increase since last retrain
    const totalDatapoints = await TrainingDatapointRepo.countDatapoints();
    const lastCount = lastTrigger?.trainingDatapointCount ?? 0;
    const newDatapoints = totalDatapoints - lastCount;
    if (newDatapoints >= config.retrain.minDatapoints) {
        reasons.push(`data_volume_increase:${newDatapoints}`);
    }
    // Fire trigger if any condition met
    if (reasons.length === 0) {
        return { triggered: false, reasons: ["no_conditions_met"] };
    }
    // Create trigger record
    const trigger = await RetrainTriggerRepo.createTrigger({
        reason: JSON.stringify(reasons),
        trainingDatapointCount: totalDatapoints,
        status: "triggered",
    });
    log.info(`[RetrainTrigger] Triggered: ${reasons.join(", ")}`);
    // Fire-and-forget: submit fine-tune job
    submitFineTuneJob({ provider: config.retrain.provider })
        .then(async (result) => {
        await RetrainTriggerRepo.updateTrigger(trigger.id, {
            modelVersionId: result.modelVersionId,
            status: result.status === "training" ? "training" : "completed",
        });
        log.info(`[RetrainTrigger] Submitted: modelVersion=${result.modelVersionId}`);
    })
        .catch(async (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await RetrainTriggerRepo.updateTrigger(trigger.id, {
            status: "failed",
            error: errorMsg,
            completedAt: new Date(),
        });
        log.error(`[RetrainTrigger] Failed:`, errorMsg);
    });
    return { triggered: true, reasons, triggerId: trigger.id };
}
//# sourceMappingURL=retrain-trigger.service.js.map