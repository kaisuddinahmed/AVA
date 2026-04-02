export declare const config: {
    readonly port: number;
    readonly wsPort: number;
    readonly log: {
        readonly level: "debug" | "info" | "warn" | "error" | "silent";
    };
    readonly db: {
        readonly url: string;
    };
    readonly groq: {
        readonly apiKey: string;
        readonly model: string;
    };
    readonly mswim: {
        readonly weights: {
            readonly intent: number;
            readonly friction: number;
            readonly clarity: number;
            readonly receptivity: number;
            readonly value: number;
        };
        readonly thresholds: {
            readonly monitor: number;
            readonly passive: number;
            readonly nudge: number;
            readonly active: number;
        };
    };
    readonly evaluation: {
        readonly batchIntervalMs: 5000;
        readonly batchMaxEvents: 10;
        readonly maxContextEvents: 50;
    };
    readonly shadow: {
        readonly enabled: boolean;
        readonly logToConsole: boolean;
    };
    readonly evalEngine: "llm" | "fast" | "auto";
    readonly jobs: {
        readonly nightlyHourUTC: number;
        readonly canaryCheckIntervalHours: number;
        readonly hourlySnapshotEnabled: boolean;
        readonly disableScheduler: boolean;
    };
    readonly drift: {
        readonly tierAgreementFloor: number;
        readonly decisionAgreementFloor: number;
        readonly maxCompositeDivergence: number;
        readonly signalShiftThreshold: number;
        readonly conversionRateDropPercent: number;
        readonly snapshotRetentionDays: number;
    };
    readonly experiments: {
        readonly enabled: boolean;
    };
    readonly controlGroupPct: number;
    readonly retrain: {
        readonly autoEnabled: boolean;
        readonly minIntervalDays: number;
        readonly minDatapoints: number;
        readonly provider: "groq";
    };
    readonly voice: {
        readonly deepgramApiKey: string;
        readonly enabled: boolean;
        readonly maxPerSession: number;
    };
};
export type Config = typeof config;
//# sourceMappingURL=config.d.ts.map