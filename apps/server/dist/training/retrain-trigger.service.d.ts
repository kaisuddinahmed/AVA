export interface RetrainCheckResult {
    triggered: boolean;
    reasons: string[];
    triggerId?: string;
}
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
export declare function checkRetrainTriggers(evalRegressionDetected?: boolean): Promise<RetrainCheckResult>;
//# sourceMappingURL=retrain-trigger.service.d.ts.map