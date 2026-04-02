export interface FlywheelResult {
    patternsUpdated: number;
    patternsSkipped: number;
    merchantsContributing: number;
    totalSessionsAnalyzed: number;
}
/**
 * Run the weekly network flywheel aggregation.
 */
export declare function runNetworkFlywheel(): Promise<FlywheelResult>;
//# sourceMappingURL=network-flywheel.job.d.ts.map