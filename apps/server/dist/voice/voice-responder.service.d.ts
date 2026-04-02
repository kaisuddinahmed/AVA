import type { WebSocket } from "ws";
/**
 * Clear the conversation history and agent state for a session.
 * Called externally when a session ends or the widget reloads.
 */
export declare function clearConversationHistory(sessionId: string): void;
interface PageContext {
    page_type?: string;
    page_url?: string;
}
/**
 * Handle a voice_query from the widget ASR pipeline.
 *
 * Flow:
 *  1. Check voice is globally enabled on this deployment.
 *  2. Load session to check voice budget / mute state.
 *  3. Build Groq messages array from system prompt + conversation history.
 *  4. Ask Groq for a short, warm shopping-assistant reply.
 *  5. Persist the new turn in conversationHistories.
 *  6. Broadcast an "active" intervention back to the widget with
 *     voice_enabled + voice_script so the TTS manager picks it up.
 *  7. Ack the sender's WS connection.
 *
 * Voice budget enforcement is intentionally lenient here: voice queries
 * are user-initiated, so we allow one extra reply even when the proactive
 * budget is exhausted — but we respect the session mute flag.
 */
export declare function handleVoiceQuery(ws: WebSocket, sessionId: string, transcript: string, pageCtx?: PageContext): Promise<void>;
export {};
//# sourceMappingURL=voice-responder.service.d.ts.map