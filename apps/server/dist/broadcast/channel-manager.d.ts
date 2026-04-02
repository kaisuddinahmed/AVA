import type { WebSocket } from "ws";
interface ClientEntry {
    ws: WebSocket;
    channel: string;
    sessionId?: string;
}
/**
 * Register a WebSocket client for a specific channel.
 */
export declare function registerClient(ws: WebSocket, channel: string, sessionId?: string): void;
/**
 * Unregister a WebSocket client.
 */
export declare function unregisterClient(ws: WebSocket): void;
/**
 * Get all clients for a specific channel.
 */
export declare function getClientsByChannel(channel: string): ClientEntry[];
/**
 * Get clients for a channel filtered by session.
 */
export declare function getClientsByChannelAndSession(channel: string, sessionId: string): ClientEntry[];
/**
 * Get count of connected clients per channel.
 */
export declare function getClientCounts(): Record<string, number>;
export {};
//# sourceMappingURL=channel-manager.d.ts.map