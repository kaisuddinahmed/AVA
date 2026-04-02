export declare class JobRunner {
    private nightlyTimer;
    private hourlyTimer;
    private canaryTimer;
    private targetHourUTC;
    constructor(targetHourUTC?: number);
    /**
     * Start all scheduled jobs.
     */
    start(): void;
    /**
     * Stop all timers.
     */
    stop(): void;
    /**
     * Trigger a nightly batch run immediately.
     */
    runNow(triggeredBy?: string): Promise<{
        jobRunId: string;
        result: Record<string, unknown>;
    }>;
    /**
     * Get the next scheduled nightly batch time.
     */
    getNextRunTime(): Date;
    private scheduleNightlyBatch;
    private executeNightlyBatch;
    private calculateMsUntilTarget;
    private startHourlySnapshots;
    private startCanaryChecks;
}
export declare function getJobRunner(): JobRunner;
//# sourceMappingURL=job-runner.d.ts.map