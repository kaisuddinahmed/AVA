export interface SessionExitPayload {
    visitorKey: string;
    siteUrl: string;
    sessionId: string;
    exitPage: string | null;
    topFrictionIds: string[];
    cartValue: number;
    productsViewed: string[];
    mswimTierAtExit: string | null;
    abandonmentScore: number | null;
    sessionDurationMs: number;
}
/**
 * Emit a session_exit webhook if:
 *   - The session ended without a conversion
 *   - The site has a webhookUrl configured
 */
export declare function emitSessionExitWebhook(sessionId: string): Promise<void>;
//# sourceMappingURL=webhook.service.d.ts.map