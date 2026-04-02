export interface SessionInitData {
    siteUrl: string;
    deviceType: string;
    referrerType: string;
    visitorId?: string;
    isLoggedIn?: boolean;
    isRepeatVisitor?: boolean;
}
/**
 * Get or create a session for a visitor.
 */
export declare function getOrCreateSession(visitorKey: string, data: SessionInitData): Promise<string>;
/**
 * Update session cart data.
 */
export declare function updateSessionCart(sessionId: string, cartValue: number, cartItemCount: number): Promise<void>;
/**
 * End a session explicitly.
 */
export declare function endSession(sessionId: string): Promise<void>;
/**
 * Clean up idle sessions (called periodically).
 */
export declare function cleanupIdleSessions(): void;
//# sourceMappingURL=session-manager.d.ts.map