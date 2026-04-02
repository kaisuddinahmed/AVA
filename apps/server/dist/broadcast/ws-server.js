import { WebSocketServer } from "ws";
import { handleTrackMessage } from "../track/track.handlers.js";
import { registerClient, unregisterClient } from "./channel-manager.js";
import { WsDashboardMessageSchema, validatePayload } from "../validation/schemas.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "broadcast" });
/**
 * Create the main WebSocket server.
 */
export function createWSServer(port) {
    const wss = new WebSocketServer({ port });
    wss.on("connection", (ws, req) => {
        const url = new URL(req.url ?? "/", `ws://localhost:${port}`);
        const channel = url.searchParams.get("channel") ?? "widget";
        const sessionId = url.searchParams.get("sessionId");
        log.info(`[WS] Client connected: channel=${channel}, session=${sessionId}`);
        // Register this client for broadcasting
        registerClient(ws, channel, sessionId ?? undefined);
        ws.on("message", (data) => {
            const message = data.toString();
            if (channel === "widget") {
                handleTrackMessage(ws, message);
            }
            else if (channel === "dashboard") {
                handleDashboardMessage(ws, message);
            }
        });
        ws.on("close", () => {
            unregisterClient(ws);
            log.info(`[WS] Client disconnected: channel=${channel}`);
        });
        ws.on("error", (error) => {
            log.error("[WS] Client error:", error.message);
            unregisterClient(ws);
        });
        // Send welcome message
        ws.send(JSON.stringify({ type: "connected", channel, sessionId }));
    });
    wss.on("error", (error) => {
        log.error("[WS] Server error:", error);
    });
    return wss;
}
function handleDashboardMessage(ws, data) {
    try {
        const raw = JSON.parse(data);
        const result = validatePayload(WsDashboardMessageSchema, raw);
        if (!result.success) {
            log.warn("[WS] Dashboard message validation failed:", result.error);
            ws.send(JSON.stringify({ type: "validation_error", error: result.error }));
            return;
        }
        // Handle dashboard control messages (e.g., select session, tune weights)
        log.info("[WS] Dashboard message:", result.data.type);
    }
    catch {
        // ignore malformed JSON
    }
}
// TODO: add to your WS message handler:
// import { handleAgentWsMessage } from '../api/agent.api.js';
// case 'agent_query': await handleAgentWsMessage(ws, msg); break;
//# sourceMappingURL=ws-server.js.map