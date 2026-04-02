export interface StartOnboardingInput {
    siteId?: string;
    siteUrl?: string;
    html?: string;
    forceReanalyze?: boolean;
    platform?: "shopify" | "woocommerce" | "magento" | "custom";
    trackingConfig?: Record<string, unknown>;
}
export interface StartOnboardingResult {
    runId: string;
    siteId: string;
    status: string;
    phase: string;
}
export declare function startOnboardingRun(payload: StartOnboardingInput): Promise<StartOnboardingResult>;
//# sourceMappingURL=onboarding.service.d.ts.map