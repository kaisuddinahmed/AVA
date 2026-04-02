export interface OnboardingProgressEvent {
    siteConfigId: string;
    analyzerRunId: string;
    status: string;
    progress: number;
    details: Record<string, unknown>;
}
export declare function broadcastOnboardingProgress(event: OnboardingProgressEvent): void;
//# sourceMappingURL=progress-broadcaster.d.ts.map