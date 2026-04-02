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
import type { SiteAdapterConfig } from '../agent/agent.types.js';
import type WebSocket from 'ws';
export declare const agentRouter: any;
export declare function handleAgentWsMessage(ws: WebSocket, msg: Record<string, unknown>, _siteConfig?: SiteAdapterConfig): Promise<void>;
//# sourceMappingURL=agent.api.d.ts.map