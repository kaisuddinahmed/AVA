/**
 * Shopping Agent Service — Story 12: Conversational Shopping Agent
 * Copy to: apps/server/src/agent/shopping-agent.service.ts
 *
 * Main orchestrator for the AVA shopping agent. Responsibilities:
 *   • In-memory conversation history per session (max 10 turns, TTL 30 min)
 *   • Intent parsing → product search → Groq response generation pipeline
 *   • Handles all AgentAction types including comparison and cart confirm
 *   • Logs every agent action as an intervention (actionCode: AGENT_*) for
 *     training data capture (Story 12 AC: agent actions logged as interventions)
 *   • Graceful fallback to navigation guidance when no search adapter available
 *   • Story 2 prerequisite fulfilled: per-session conversation history passed
 *     to Groq on every call with page context grounding
 */
import type { AgentResponse, PageContext, SiteAdapterConfig } from './agent.types.js';
export declare function clearSession(sessionId: string): void;
export interface ProcessQueryOptions {
    sessionId: string;
    query: string;
    pageContext: PageContext;
    siteConfig: SiteAdapterConfig;
    /** Forwarded directly from widget: verified add-to-cart selector from onboarding */
    addToCartSelector?: string;
}
export declare function processQuery(opts: ProcessQueryOptions): Promise<AgentResponse>;
/**
 * Convenience wrapper called by voice-responder.service.ts.
 * Accepts a loose context shape (PageContext + siteUrl) from the voice path.
 */
export declare function handleShoppingQuery(sessionId: string, transcript: string, agentCtx: Partial<PageContext> & {
    siteUrl?: string;
}): Promise<AgentResponse>;
/**
 * Persists an evaluation + intervention for a voice-driven agent response,
 * then broadcasts it to the widget. Returns the intervention ID.
 */
export declare function broadcastAgentResponse(sessionId: string, agentResponse: AgentResponse, voicePlayback: boolean): Promise<string>;
//# sourceMappingURL=shopping-agent.service.d.ts.map