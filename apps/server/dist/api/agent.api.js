/**
 * Agent API Routes — Story 12: Conversational Shopping Agent
 * Copy to: apps/server/src/api/agent.api.ts   (NEW FILE — does not yet exist)
 *
 * Then register in apps/server/src/api/routes.ts:
 *
 *   import { agentRouter } from './agent.api.js';
 *   app.use('/api/agent', agentRouter);
 *
 * For WebSocket: in apps/server/src/broadcast/ws-server.ts (or wherever
 * incoming WS messages are dispatched), add a handler for type 'agent_query':
 *
 *   case 'agent_query': await handleAgentWsMessage(ws, msg, siteConfig); break;
 */
import { Router } from 'express';
import { processQuery, clearSession } from '../agent/shopping-agent.service.js';
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
export const agentRouter = Router();
// ─── REST endpoint — text fallback (POST /api/agent/query) ───────────────────
agentRouter.post('/query', async (req, res) => {
    try {
        const { sessionId, query, pageContext, siteConfig } = req.body;
        if (!sessionId || !query) {
            return res.status(400).json({ error: 'sessionId and query are required' });
        }
        const response = await processQuery({ sessionId, query, pageContext, siteConfig });
        return res.json(response);
    }
    catch (err) {
        log.error('[AVA agent] REST error:', err);
        return res.status(500).json({ error: 'Agent unavailable' });
    }
});
// ─── Session cleanup (DELETE /api/agent/session/:sessionId) ──────────────────
agentRouter.delete('/session/:sessionId', (req, res) => {
    clearSession(req.params.sessionId);
    return res.json({ ok: true });
});
// ─── WebSocket message handler ────────────────────────────────────────────────
//
// Call this from the existing WS message dispatcher when msg.type === 'agent_query'.
//
// Expected WS message shape:
// {
//   type: 'agent_query',
//   sessionId: string,
//   query: string,
//   pageContext: PageContext,
//   siteConfig: SiteAdapterConfig,
//   addToCartSelector?: string,   // from onboarding friction mapping
// }
export async function handleAgentWsMessage(ws, msg, _siteConfig) {
    const sessionId = String(msg.sessionId ?? '');
    const query = String(msg.query ?? '');
    if (!sessionId || !query) {
        ws.send(JSON.stringify({ type: 'agent_error', error: 'sessionId and query required' }));
        return;
    }
    const pageContext = msg.pageContext ?? {
        pageType: 'other',
        pageUrl: String(msg.siteUrl ?? ''),
    };
    const siteConfig = (_siteConfig ?? msg.siteConfig);
    if (!siteConfig?.siteUrl) {
        ws.send(JSON.stringify({ type: 'agent_error', error: 'siteConfig.siteUrl required' }));
        return;
    }
    // Send typing indicator immediately
    ws.send(JSON.stringify({ type: 'agent_typing', sessionId }));
    try {
        const response = await processQuery({
            sessionId,
            query,
            pageContext,
            siteConfig,
            addToCartSelector: String(msg.addToCartSelector ?? ''),
        });
        ws.send(JSON.stringify({ type: 'agent_response', ...response }));
    }
    catch (err) {
        log.error('[AVA agent] WS error:', err);
        ws.send(JSON.stringify({
            type: 'agent_response',
            sessionId,
            responseType: 'error',
            message: 'Sorry, I had trouble processing that. Please try again.',
            turnIndex: -1,
        }));
    }
}
//# sourceMappingURL=agent.api.js.map