import type { MSWIMResult, BehaviorGroup } from "@ava/shared";
export interface LLMOutput {
    intent: number;
    friction: number;
    clarity: number;
    receptivity: number;
    value: number;
    detectedFrictionIds: string[];
    recommendedAction: string;
}
export interface SessionContext {
    sessionId: string;
    siteUrl: string;
    sessionAgeSec: number;
    pageType: string;
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    cartValue: number;
    cartItemCount: number;
    deviceType: string;
    referrerType: string;
    eventCount: number;
    ruleBasedCorroboration: boolean;
    totalInterventionsFired: number;
    totalDismissals: number;
    totalNudges: number;
    totalActive: number;
    totalNonPassive: number;
    secondsSinceLastIntervention: number | null;
    secondsSinceLastActive: number | null;
    secondsSinceLastNudge: number | null;
    secondsSinceLastDismissal: number | null;
    frictionIdsAlreadyIntervened: string[];
    widgetOpenedVoluntarily: boolean;
    idleSeconds: number;
    hasTechnicalError: boolean;
    hasOutOfStock: boolean;
    hasShippingIssue: boolean;
    hasPaymentFailure: boolean;
    hasCheckoutTimeout: boolean;
    hasHelpSearch: boolean;
    hasRecentCheckoutAbandon: boolean;
    detectedBehaviorPatternIds: string[];
    activeBehaviorGroups: BehaviorGroup[];
    scoringConfigId?: string;
}
/**
 * Main MSWIM scoring pipeline:
 * LLM signals + session state → adjusted signals → composite → gates → tier → decision
 */
export declare function runMSWIM(llmOutput: LLMOutput, sessionCtx: SessionContext): Promise<MSWIMResult>;
//# sourceMappingURL=mswim.engine.d.ts.map