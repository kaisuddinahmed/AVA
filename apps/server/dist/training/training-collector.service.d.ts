/**
 * Snapshot the full decision cycle into a TrainingDatapoint.
 * Called from recordInterventionOutcome after the outcome is persisted.
 *
 * Non-terminal outcomes (e.g. "delivered") are skipped — they're
 * intermediate states, not labels we can train on.
 */
export declare function captureTrainingDatapoint(interventionId: string, outcome: string): Promise<string | null>;
//# sourceMappingURL=training-collector.service.d.ts.map