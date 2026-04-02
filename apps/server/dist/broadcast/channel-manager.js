const clients = [];
/**
 * Register a WebSocket client for a specific channel.
 */
export function registerClient(ws, channel, sessionId) {
    clients.push({ ws, channel, sessionId });
}
/**
 * Unregister a WebSocket client.
 */
export function unregisterClient(ws) {
    const idx = clients.findIndex((c) => c.ws === ws);
    if (idx !== -1)
        clients.splice(idx, 1);
}
/**
 * Get all clients for a specific channel.
 */
export function getClientsByChannel(channel) {
    return clients.filter((c) => c.channel === channel && c.ws.readyState === c.ws.OPEN);
}
/**
 * Get clients for a channel filtered by session.
 */
export function getClientsByChannelAndSession(channel, sessionId) {
    return clients.filter((c) => c.channel === channel &&
        c.ws.readyState === c.ws.OPEN &&
        (!c.sessionId || c.sessionId === sessionId));
}
/**
 * Get count of connected clients per channel.
 */
export function getClientCounts() {
    const counts = {};
    for (const c of clients) {
        if (c.ws.readyState === c.ws.OPEN) {
            counts[c.channel] = (counts[c.channel] ?? 0) + 1;
        }
    }
    return counts;
}
//# sourceMappingURL=channel-manager.js.map