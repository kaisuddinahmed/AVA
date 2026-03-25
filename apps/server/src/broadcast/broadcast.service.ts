import { getClientsByChannel, getClientsByChannelAndSession } from "./channel-manager.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "broadcast" });

/**
 * Broadcast a message to all clients on a channel.
 */
export function broadcastToChannel(
  channel: string,
  message: Record<string, unknown>
): void {
  const payload = JSON.stringify(message);
  const clients = getClientsByChannel(channel);

  for (const client of clients) {
    try {
      client.ws.send(payload);
    } catch (error) {
      log.error(`[Broadcast] Failed to send to ${channel} client:`, error);
    }
  }
}

/**
 * Broadcast a message to clients on a channel for a specific session.
 */
export function broadcastToSession(
  channel: string,
  sessionId: string,
  message: Record<string, unknown>
): void {
  const payload = JSON.stringify(message);
  const clients = getClientsByChannelAndSession(channel, sessionId);

  for (const client of clients) {
    try {
      client.ws.send(payload);
    } catch (error) {
      log.error(`[Broadcast] Failed to send to ${channel}/${sessionId}:`, error);
    }
  }
}
