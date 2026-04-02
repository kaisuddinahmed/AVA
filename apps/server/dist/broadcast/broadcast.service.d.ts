/**
 * Broadcast a message to all clients on a channel.
 */
export declare function broadcastToChannel(channel: string, message: Record<string, unknown>): void;
/**
 * Broadcast a message to clients on a channel for a specific session.
 */
export declare function broadcastToSession(channel: string, sessionId: string, message: Record<string, unknown>): void;
//# sourceMappingURL=broadcast.service.d.ts.map