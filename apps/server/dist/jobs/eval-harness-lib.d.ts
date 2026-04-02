export interface EvalDatapoint {
    id: string;
    outcome: string;
    tier: string;
    decision: string;
    compositeScore: number;
    intentScore: number;
    frictionScore: number;
    clarityScore: number;
    receptivityScore: number;
    valueScore: number;
    gateOverride: string | null;
    interventionType: string;
    frictionId: string;
    frictionsFound: string[];
    deviceType: string;
    pageType: string;
    cartValue: number;
    sessionAgeSec: number;
}
export interface ConfusionMatrix {
    matrix: Record<string, Record<string, number>>;
    labels: {
        rows: string[];
        cols: string[];
    };
}
export interface MetricsPerClass {
    precision: number;
    recall: number;
    f1: number;
    support: number;
}
export interface EvalReport {
    metadata: {
        timestamp: string;
        testSize: number;
        sampling: string;
        outcomeFilter: string[];
        siteFilter: string;
        dateRange: {
            since: string;
            until: string;
        };
    };
    overall: {
        totalEvaluated: number;
        outcomeDistribution: Record<string, number>;
        tierDistribution: Record<string, number>;
    };
    tierAccuracy: {
        interventionEffectiveness: number;
        suppressionAccuracy: number;
        confusionMatrix: ConfusionMatrix;
    };
    decisionMetrics: {
        fireConversionRate: number;
        fireDismissalRate: number;
        suppressConversionRate: number;
        perOutcome: Record<string, MetricsPerClass>;
    };
    signalCalibration: {
        byOutcome: Record<string, {
            avgIntent: number;
            avgFriction: number;
            avgClarity: number;
            avgReceptivity: number;
            avgValue: number;
            avgComposite: number;
            count: number;
        }>;
    };
    segmentAnalysis: {
        byDevice: Record<string, {
            total: number;
            converted: number;
            rate: number;
        }>;
        byPage: Record<string, {
            total: number;
            converted: number;
            rate: number;
        }>;
        byTier: Record<string, {
            total: number;
            converted: number;
            dismissed: number;
            ignored: number;
        }>;
    };
    regressionFlags: {
        detected: boolean;
        issues: string[];
    };
}
export interface EvalHarnessOptions {
    testSize: number;
    sampling: "random" | "stratified";
    outcomeFilter: string;
    siteFilter?: string;
    since?: string;
    until?: string;
}
export declare function loadTestSet(options: EvalHarnessOptions): Promise<EvalDatapoint[]>;
export declare function evaluate(datapoints: EvalDatapoint[], validOutcomes: string[], meta?: {
    sampling?: string;
    siteFilter?: string;
    since?: string;
    until?: string;
}): EvalReport;
//# sourceMappingURL=eval-harness-lib.d.ts.map