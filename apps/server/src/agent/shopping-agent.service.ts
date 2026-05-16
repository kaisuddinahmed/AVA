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

import Groq from 'groq-sdk';
import { parseIntent } from './intent-parser.js';
import { searchProducts } from './product-search-adapter.js';
import { broadcastToSession } from '../broadcast/broadcast.service.js';
import { InterventionRepo, EvaluationRepo, SessionRepo, ConversationStateRepo } from '@ava/db';
import { tierDirective, asMswimTier, type MswimTier } from '../voice/mswim-directives.js';
import { logger } from '../logger.js';
import type {
  AgentResponse,
  AgentResponseType,
  ConversationMessage,
  PageContext,
  ParsedIntent,
  ProductResult,
  SiteAdapterConfig,
} from './agent.types.js';

const log = logger.child({ service: 'shopping-agent' });

// ─── Session store (Phase 2.1 — DB-backed) ──────────────────────────────────
//
// Per-request working struct hydrated from ConversationStateRepo at the start
// of processQuery() and persisted at the end. The DB row is the source of
// truth; in-process state is just a scratch copy that lives for the duration
// of one query. Survives widget reloads + server restarts.

const MAX_TURNS = 10;

interface SessionContext {
  history: ConversationMessage[];
  lastResults: ProductResult[];       // Products from the most recent search turn
  turnIndex: number;
}

/**
 * Hydrate a per-request SessionContext from the persisted row. Returns a
 * fresh empty context on first turn or if the row was purged. Never throws —
 * a DB blip just costs the conversation its memory for this request.
 */
async function hydrateSession(sessionId: string): Promise<SessionContext> {
  try {
    const row = await ConversationStateRepo.getBySession(sessionId);
    if (!row) return { history: [], lastResults: [], turnIndex: 0 };

    let history: ConversationMessage[] = [];
    try {
      const raw = JSON.parse(row.turns) as Array<{ role: string; content: string; timestamp?: number; products?: ProductResult[] }>;
      history = raw
        .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
        .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content, timestamp: t.timestamp ?? Date.now(), products: t.products }));
    } catch { /* fall through with empty history */ }

    let lastResults: ProductResult[] = [];
    if (row.comparisonSet) {
      try { lastResults = JSON.parse(row.comparisonSet) as ProductResult[]; }
      catch { /* ignore — empty results is safe */ }
    }
    const turnIndex = Math.floor(row.turnCount / 2);
    return { history, lastResults, turnIndex };
  } catch (err) {
    log.warn({ err, sessionId }, '[ShoppingAgent] hydrate failed; starting fresh');
    return { history: [], lastResults: [], turnIndex: 0 };
  }
}

/**
 * Persist the working SessionContext back to the DB at the end of a query.
 * Always best-effort — a failed write doesn't break the response that's
 * already been generated for the user.
 */
async function persistSession(
  sessionId: string,
  siteUrl: string,
  ctx: SessionContext,
): Promise<void> {
  try {
    const capped = ctx.history.slice(-MAX_TURNS * 2).map((t) => ({
      role: t.role,
      content: t.content,
      timestamp: t.timestamp,
      ...(t.products ? { products: t.products } : {}),
    }));
    await ConversationStateRepo.upsert({
      sessionId,
      siteUrl,
      turns: JSON.stringify(capped),
      turnCount: capped.length,
      comparisonSet: ctx.lastResults.length > 0 ? JSON.stringify(ctx.lastResults) : null,
    });
  } catch (err) {
    log.warn({ err, sessionId }, '[ShoppingAgent] persist failed (non-blocking)');
  }
}

function pushHistory(ctx: SessionContext, role: 'user' | 'assistant', content: string, products?: ProductResult[]): void {
  ctx.history.push({ role, content, timestamp: Date.now(), products });
  if (ctx.history.length > MAX_TURNS * 2) ctx.history.splice(0, 2); // evict oldest pair
}

/**
 * Purge the persisted conversation + agent state for a session. Replaces the
 * old in-memory Map.delete() with a DB purge. Async — callers may
 * fire-and-forget if they previously used the sync .delete() pattern.
 */
export async function clearAgentState(sessionId: string): Promise<void> {
  try {
    await ConversationStateRepo.purgeBySession(sessionId);
  } catch (err) {
    log.warn({ err, sessionId }, '[ShoppingAgent] clearAgentState purge failed');
  }
}

// ─── Groq instance ────────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: PageContext, tier?: MswimTier | null): string {
  const cartSummary = ctx.cartContents?.length
    ? `Cart: ${ctx.cartContents.map(c => `${c.quantity}x ${c.title} ($${c.price})`).join(', ')}`
    : 'Cart: empty';
  const inViewSummary = ctx.productsInView?.length
    ? `Products currently visible: ${ctx.productsInView.map(p => `${p.title} ($${p.price})`).join(', ')}`
    : '';

  return `You are AVA, a knowledgeable and friendly shopping assistant embedded in an online store.
Your goal is to help shoppers find the right product through natural conversation.

Current page: ${ctx.pageType} — ${ctx.pageUrl}
${inViewSummary ? inViewSummary + '\n' : ''}${cartSummary}

${tierDirective(tier)}

Guidelines:
- Be concise (1-3 sentences). The response will be read aloud via TTS.
- Reference prior conversation turns naturally ("As I mentioned...", "Based on what you said...").
- When showing products, briefly narrate the top recommendation. Do NOT list all products — the UI handles that.
- For comparisons, highlight the key differentiator between options.
- For add-to-cart, confirm what you're adding before doing it.
- If you cannot find relevant products, say so and suggest navigating to a relevant section.
- Never make up product details. Only reference products actually returned by search.`;
}

// ─── Response generators ──────────────────────────────────────────────────────

async function generateNarration(
  ctx: SessionContext,
  pageCtx: PageContext,
  intent: ParsedIntent,
  products: ProductResult[],
  tier: MswimTier | null,
): Promise<string> {
  const productContext = products.slice(0, 3).map((p, i) =>
    `${i + 1}. ${p.title} — $${p.price} ${p.matchedAttributes.length ? `(matches: ${p.matchedAttributes.join(', ')})` : ''}`
  ).join('\n');

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(pageCtx, tier) },
    ...ctx.history.slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    {
      role: 'user',
      content: `Shopper said: "${intent.raw}"\n\nSearch results:\n${productContext || 'No results found.'}\n\nRespond naturally in 1-3 sentences.`,
    },
  ];

  const resp = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama3-8b-8192',
    messages,
    temperature: 0.4,
    max_tokens: 150,
  });
  return resp.choices[0]?.message?.content?.trim() ?? 'Here\'s what I found for you.';
}

async function generateMessage(
  ctx: SessionContext,
  pageCtx: PageContext,
  userMessage: string,
  tier: MswimTier | null,
): Promise<string> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(pageCtx, tier) },
    ...ctx.history.slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const resp = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama3-8b-8192',
    messages,
    temperature: 0.4,
    max_tokens: 150,
  });
  return resp.choices[0]?.message?.content?.trim() ?? 'I\'m here to help!';
}

// ─── Intervention logger ──────────────────────────────────────────────────────

// Dynamically import prisma so the agent works even if @ava/db is not yet
// migrated during development (does not crash the server at startup).
async function logAgentAction(
  sessionId: string,
  siteUrl: string,
  actionCode: string,
  intent: ParsedIntent,
  productsShown: string[],
  turnIndex: number,
  latencyMs: number,
): Promise<void> {
  try {
    await InterventionRepo.createAgentActionLog({
      sessionId,
      actionCode,
      intentRaw: intent.raw,
      intentAction: intent.action,
      intentCategory: intent.category ?? null,
      intentAttributes: JSON.stringify(intent.attributes),
      productsShown: JSON.stringify(productsShown),
      turnIndex,
      latencyMs,
    });
    void siteUrl; // captured for future AgentActionLog model
  } catch {
    // Non-fatal — training capture should never break the conversation
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface ProcessQueryOptions {
  sessionId: string;
  query: string;
  pageContext: PageContext;
  siteConfig: SiteAdapterConfig;
  /** Forwarded directly from widget: verified add-to-cart selector from onboarding */
  addToCartSelector?: string;
}

export async function processQuery(opts: ProcessQueryOptions): Promise<AgentResponse> {
  const { sessionId, query, pageContext, siteConfig, addToCartSelector } = opts;
  // Phase 2.1: hydrate from persisted state instead of an in-memory Map.
  // This makes conversation memory survive widget reloads + server restarts.
  const ctx = await hydrateSession(sessionId);
  const t0 = Date.now();

  // Phase 2.2: scale assertiveness with the shopper's latest MSWIM tier.
  // Codex P1 fix: exclude this agent's own AGENT_VOICE / VOICE_REPLY
  // synthetic evals — otherwise the agent self-shadows the real friction
  // tier (e.g. ESCALATE cart recovery silently downgrades to NUDGE).
  let tier: MswimTier | null = null;
  try {
    const latest = await EvaluationRepo.getLatestNonVoiceEvaluation(sessionId);
    tier = asMswimTier(latest?.tier);
  } catch (err) {
    log.warn({ err, sessionId }, '[ShoppingAgent] tier lookup failed; defaulting to PASSIVE');
  }

  // Parse intent with full conversation history for context
  const intent = await parseIntent(query, ctx.history);

  // Push user turn before processing (agents that respond to prior turns need history)
  pushHistory(ctx, 'user', query);

  let responseType: AgentResponseType = 'message';
  let message = '';
  let products: ProductResult[] | undefined;
  let navigateTo: string | undefined;
  let cartTarget: AgentResponse['cartTarget'] | undefined;
  let searchQuery: string | undefined;

  // ── Route by action ──
  switch (intent.action) {
    case 'search': {
      const result = await searchProducts(siteConfig, intent);
      searchQuery = (intent.raw ?? query).replace(/[.,!?;:…]+$/, "").trim();
      if (result.fallbackUrl) {
        // No search adapter — navigate instead
        navigateTo = result.fallbackUrl;
        responseType = 'navigate';
        const displayTerm = (intent.category ?? (intent.raw ?? query)
          .replace(/^(show me|i need|find me|can you find|looking for|search for|let me see|give me|i want|i'm looking for|i am looking for|can i see|display|bring up|get me)\s+/i, "")
          .replace(/^(some|a|an|the)\s+/i, "")
          .replace(/[.,!?;:…]+$/, "")
          .trim()
          .toLowerCase());
        message = `Here's our ${displayTerm} collection! Are you looking for a specific color or size?`;
      } else {
        products = result.products.slice(0, 5);
        ctx.lastResults = products;
        responseType = 'products';
        message = await generateNarration(ctx, pageContext, intent, products, tier);
      }
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_SEARCH', intent,
        products?.map(p => p.id) ?? [], ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'compare': {
      const indices = intent.referenceIndices ?? [0, 1];
      products = indices.map(i => ctx.lastResults[i]).filter(Boolean);
      responseType = products.length >= 2 ? 'comparison' : 'message';
      if (products.length >= 2) {
        const [a, b] = products;
        const diff = a.price !== b.price ? `$${a.price} vs $${b.price}` : 'similar price';
        message = `Comparing ${a.title} and ${b.title}. ${diff}. ${
          a.matchedAttributes.length ? `The ${a.title} is stronger on: ${a.matchedAttributes.join(', ')}.` : ''
        }`;
      } else {
        message = 'I don\'t have two products to compare yet. Let me search first — what are you looking for?';
      }
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_COMPARE', intent,
        products?.map(p => p.id) ?? [], ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'add_to_cart': {
      const idx = intent.referenceIndex ?? 0;
      const target = ctx.lastResults[idx];
      if (target) {
        cartTarget = { product: target, addToCartSelector };
        responseType = 'cart_confirm';
        message = `Just to confirm — you'd like me to add the ${target.title} ($${target.price}) to your cart?`;
      } else {
        message = 'Which product would you like to add? Say the name or "the first one", "the second one", etc.';
        responseType = 'clarification';
      }
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_CART_CONFIRM', intent,
        target ? [target.id] : [], ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'show_cheaper': {
      const sorted = [...ctx.lastResults].sort((a, b) => a.price - b.price);
      products = sorted.slice(0, 5);
      ctx.lastResults = products;
      responseType = 'products';
      message = products.length
        ? `Here are the more affordable options, starting from $${products[0].price}.`
        : 'I don\'t have cheaper alternatives in the current results. Want me to search again with a lower budget?';
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_SEARCH', intent,
        products.map(p => p.id), ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'show_more_expensive': {
      const sorted = [...ctx.lastResults].sort((a, b) => b.price - a.price);
      products = sorted.slice(0, 5);
      ctx.lastResults = products;
      responseType = 'products';
      message = products.length
        ? `Here are the premium options, up to $${products[0].price}.`
        : 'I don\'t have pricier options in the current results. Want me to search again?';
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_SEARCH', intent,
        products.map(p => p.id), ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'navigate': {
      const q = intent.category ?? intent.raw;
      navigateTo = `${siteConfig.siteUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}`;
      responseType = 'navigate';
      message = `Taking you to the ${intent.category ?? 'search results'} section now.`;
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_NAVIGATE', intent,
        [], ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'clarify': {
      responseType = 'clarification';
      message = intent.clarificationPrompt ?? 'Could you tell me a bit more about what you\'re looking for?';
      // Still filter the store if we know the category — better UX to show relevant products
      // while asking for refinement rather than showing everything
      if (intent.category) searchQuery = intent.category;
      else if (intent.raw) searchQuery = intent.raw;
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_CLARIFY', intent,
        [], ctx.turnIndex, Date.now() - t0);
      break;
    }

    case 'show_more': {
      if (ctx.lastResults.length > 0) {
        products = ctx.lastResults;
        responseType = 'products';
        searchQuery = intent.raw;
        message = 'Here\'s what I have. Would you like me to refine the search — perhaps a different price range or specific features?';
      } else {
        // No prior search — derive category from conversation history and search fresh.
        // Skip "show all / show more" type meta-commands when scanning history for the real product term.
        const SHOW_ALL_RE = /\b(show me all|show all|see all|all of (them|it)|all products?|everything|show more|more options|see more|what else|other options)\b/i;
        const lastUserMsg = [...ctx.history].reverse().find(m =>
          m.role === 'user' && m.content !== query && !SHOW_ALL_RE.test(m.content)
        );
        const fallbackQuery = lastUserMsg?.content ?? intent.category ?? null;
        if (fallbackQuery) {
          const freshIntent = { ...intent, action: 'search' as const, category: fallbackQuery, raw: fallbackQuery };
          const result = await searchProducts(siteConfig, freshIntent);
          searchQuery = fallbackQuery;
          if (result.fallbackUrl) {
            navigateTo = result.fallbackUrl;
            responseType = 'navigate';
            message = `Here's our full ${fallbackQuery} collection! Let me know if you'd like to filter by size or color.`;
          } else {
            products = result.products.slice(0, 5);
            ctx.lastResults = products;
            responseType = 'products';
            message = products.length
              ? await generateNarration(ctx, pageContext, freshIntent, products, tier)
              : `I couldn't find any ${fallbackQuery} right now. Could you describe what you're looking for?`;
          }
        } else {
          // No context at all — ask what they want to see
          responseType = 'clarification';
          message = 'Sure! What are you looking for? I can help you find shoes, clothing, accessories, and more.';
        }
      }
      break;
    }

    default: {
      // chitchat / unrecognised
      responseType = 'message';
      message = await generateMessage(ctx, pageContext, query, tier);
      await logAgentAction(sessionId, siteConfig.siteUrl, 'AGENT_FALLBACK', intent,
        [], ctx.turnIndex, Date.now() - t0);
    }
  }

  // Push assistant turn to history
  pushHistory(ctx, 'assistant', message, products);
  const turnIndex = ctx.turnIndex++;

  // Phase 2.1: persist the updated context so the next query (or the next
  // session after a reload) starts from the same state. Fire-and-forget —
  // a write failure doesn't poison the response already on its way.
  void persistSession(sessionId, siteConfig.siteUrl, ctx);

  return { sessionId, responseType, message, products, cartTarget, navigateTo, searchQuery, turnIndex };
}

// ─── Voice integration helpers ────────────────────────────────────────────────

/**
 * Convenience wrapper called by voice-responder.service.ts.
 * Accepts a loose context shape (PageContext + siteUrl) from the voice path.
 */
export async function handleShoppingQuery(
  sessionId: string,
  transcript: string,
  agentCtx: Partial<PageContext> & { siteUrl?: string },
): Promise<AgentResponse> {
  const siteUrl = agentCtx.siteUrl ?? '';
  const pageContext: PageContext = {
    pageType: agentCtx.pageType ?? 'other',
    pageUrl: agentCtx.pageUrl ?? siteUrl,
    ...agentCtx,
  };
  const siteConfig: SiteAdapterConfig = { siteUrl };
  return processQuery({ sessionId, query: transcript, pageContext, siteConfig });
}

const AGENT_VOICE_WEIGHTS = JSON.stringify({ intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.20, value: 0.15 });

/**
 * Persists an evaluation + intervention for a voice-driven agent response,
 * then broadcasts it to the widget. Returns the intervention ID.
 */
export async function broadcastAgentResponse(
  sessionId: string,
  agentResponse: AgentResponse,
  voicePlayback: boolean,
): Promise<string> {
  const voiceScript = agentResponse.message.length > 80
    ? agentResponse.message.slice(0, 77) + '…'
    : agentResponse.message;

  const payload = {
    type: 'active' as const,
    action_code: 'AGENT_VOICE',
    friction_id: 'F036',
    message: agentResponse.message,
    products: agentResponse.products,
    cartTarget: agentResponse.cartTarget,
    navigateTo: agentResponse.navigateTo,
    searchQuery: agentResponse.searchQuery,
    voice_enabled: voicePlayback,
    voice_script: voicePlayback ? voiceScript : undefined,
  };

  let interventionId = `av_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const evaluation = await EvaluationRepo.createEvaluation({
      sessionId,
      eventBatchIds: '[]',
      narrative: `Agent voice response (turn ${agentResponse.turnIndex})`,
      frictionsFound: '["F036"]',
      intentScore: 65,
      frictionScore: 50,
      clarityScore: 55,
      receptivityScore: 75,
      valueScore: 60,
      compositeScore: 62,
      weightsUsed: AGENT_VOICE_WEIGHTS,
      tier: 'NUDGE',
      decision: 'fire',
      reasoning: 'User-initiated voice shopping query — always respond',
    });

    const intervention = await InterventionRepo.createIntervention({
      sessionId,
      evaluationId: evaluation.id,
      type: 'active',
      actionCode: 'AGENT_VOICE',
      frictionId: 'F036',
      payload: JSON.stringify(payload),
      mswimScoreAtFire: 62,
      tierAtFire: 'NUDGE',
    });

    interventionId = intervention.id;
    SessionRepo.incrementVoiceInterventionsFired(sessionId).catch(() => {});
  } catch {
    // Non-fatal — still broadcast with synthetic ID
  }

  broadcastToSession('widget', sessionId, {
    type: 'intervention',
    sessionId,
    payload: { ...payload, intervention_id: interventionId },
  });

  return interventionId;
}
