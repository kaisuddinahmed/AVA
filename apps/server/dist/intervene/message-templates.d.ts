export interface SessionContext {
    isRepeatVisitor: boolean;
    totalDismissals: number;
    totalConversions: number;
    totalInterventionsFired: number;
    cartValue: number;
}
interface MessageTemplate {
    message: string;
    voiceScript?: string;
    bubbleText?: string;
    ctaLabel?: string;
    ctaAction?: string;
    uiAdjustments?: Array<{
        adjustment_type: string;
        target_selector?: string;
        params: Record<string, unknown>;
    }>;
}
/**
 * Get a message template based on intervention type, friction ID, and session context.
 * Selects the appropriate tier based on visitor signals.
 */
export declare function getMessageTemplate(_type: string, frictionId: string, ctx?: SessionContext): MessageTemplate;
export {};
//# sourceMappingURL=message-templates.d.ts.map