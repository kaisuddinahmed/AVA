# Story 12 — Conversational Shopping Agent: Wiring Guide

## Files in this directory

Copy each file to its destination path (shown at the top of each file):

| File | Destination |
|------|-------------|
| `server/agent/agent.types.ts` | `apps/server/src/agent/agent.types.ts` |
| `server/agent/intent-parser.ts` | `apps/server/src/agent/intent-parser.ts` |
| `server/agent/product-search-adapter.ts` | `apps/server/src/agent/product-search-adapter.ts` |
| `server/agent/shopping-agent.service.ts` | `apps/server/src/agent/shopping-agent.service.ts` |
| `server/api/agent.api.ts` | `apps/server/src/api/agent.api.ts` (**NEW** — does not exist yet) |
| `widget/agent/agent.types.ts` | `apps/widget/src/agent/agent.types.ts` |
| `widget/agent/agent.controller.ts` | `apps/widget/src/agent/agent.controller.ts` |
| `widget/agent/intervention-handler.ts` | `apps/widget/src/agent/intervention-handler.ts` |

---

## 1 — Register the agent router in routes.ts

In `apps/server/src/api/routes.ts`, add:

```typescript
import { agentRouter } from './agent.api.js';

// Inside your route registration (after existing routes):
app.use('/api/agent', agentRouter);
```

---

## 2 — Wire the WebSocket dispatcher

In `apps/server/src/broadcast/ws-server.ts` (or wherever incoming WS messages
are switched by `msg.type`), add:

```typescript
import { handleAgentWsMessage } from '../api/agent.api.js';

// In your message switch:
case 'agent_query':
  await handleAgentWsMessage(ws, msg, siteConfig);
  break;
```

`siteConfig` is the SiteAdapterConfig resolved from the session's siteUrl.
At minimum it needs `{ siteUrl, shopifyStorefrontToken?, searchUrl? }`.

---

## 3 — Instantiate AgentController in the widget shell

In `apps/widget/src/widget-shell.ts` (or wherever the panel and WS transport
are wired up), add:

```typescript
import { AgentController } from './agent/agent.controller.js';

const agentController = new AgentController({
  ws: wsTransport,           // existing WsTransport instance
  panel: panel,              // existing Panel instance
  sessionId: session.id,
  siteUrl: config.siteUrl,
  shopifyStorefrontToken: config.shopifyStorefrontToken,
  searchUrl: config.searchUrl,
  addToCartSelector: config.addToCartSelector,  // from onboarding FrictionMapping
  pageContextProvider: {
    getContext: () => ({
      pageType: detectPageType(),   // your existing page type detection
      pageUrl: window.location.href,
      productsInView: getProductsInView(),
      cartContents: getCartContents(),
    }),
  },
  onTtsRequest: (text) => voiceManager.speak(text),  // existing TTS integration
});

// Connect voice input:
voiceManager.onTranscript = (text) => agentController.handleVoiceInput(text);

// Connect text input:
inputBar.onSubmit = (text) => agentController.handleTextInput(text);
```

---

## 4 — Environment variables

Ensure these are set in your `.env`:

```
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama3-8b-8192   # optional, this is the default
```

---

## 5 — Prisma schema additions

The agent logs interventions. Ensure the `Intervention` model has these fields
(add any that are missing in `packages/db/prisma/schema.prisma`):

```prisma
model Intervention {
  // ... existing fields ...
  actionCode        String?
  intentRaw         String?
  intentAction      String?
  intentCategory    String?
  intentAttributes  String?   // JSON array
  productsShown     String?   // JSON array of product IDs
  turnIndex         Int?
  latencyMs         Int?
}
```

Then run:
```bash
cd packages/db && npx prisma migrate dev --name add_agent_intervention_fields
```

---

## 6 — Build

From the project root:
```bash
npm run build
```

The `agent/` directory will now compile and appear in `apps/server/dist/agent/`.

---

## Story 2 prerequisite (multi-turn voice)

The `shopping-agent.service.ts` already implements per-session conversation
history (max 10 turns, 30-min TTL, keyed by sessionId). Every Groq call
includes the last 8 history turns + current page context. This satisfies all
Story 2 acceptance criteria for the agent path.

For the general voice path (non-agent voice queries), apply the same pattern
in `apps/server/src/voice/voice-responder.service.ts`: maintain a
`Map<sessionId, Groq.Chat.ChatCompletionMessageParam[]>` and pass it to every
Groq call.

---

## Acceptance criteria checklist

- [x] Voice + text input accepted
- [x] Intent decomposed: category, price constraint, attributes
- [x] Shopify Storefront API adapter
- [x] Generic site search adapter (JSON-LD + JSON response)
- [x] Keyword fallback adapter (navigation URL)
- [x] Product cards rendered (image, name, price, matched attributes)
- [x] TTS narration hook (`onTtsRequest`)
- [x] "Compare the first two" → comparison card
- [x] "Add that to my cart" → confirmation prompt → selector-triggered click
- [x] Multi-turn conversation history (max 10 turns, 30-min TTL)
- [x] Graceful fallback to navigation when no adapter configured
- [x] Agent actions logged as interventions with `actionCode: AGENT_*`
- [x] Session cleared on page unload / widget close
