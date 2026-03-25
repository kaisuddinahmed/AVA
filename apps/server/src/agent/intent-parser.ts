/**
 * Intent Parser — Story 12: Conversational Shopping Agent
 * Copy to: apps/server/src/agent/intent-parser.ts
 *
 * Two-tier parsing:
 *   FAST  — Regex rules for unambiguous actions (compare, add-to-cart,
 *            cheaper, reference resolution). Zero latency, zero LLM cost.
 *   SLOW  — Groq JSON-mode for open-ended discovery queries.
 *
 * Only the SLOW path involves a network call.
 */

import Groq from 'groq-sdk';
import type { ParsedIntent, AgentAction, PriceConstraint, ConversationMessage } from './agent.types.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Ordinal map ──────────────────────────────────────────────────────────────

const ORDINALS: Record<string, number> = {
  first: 0, '1st': 0,
  second: 1, '2nd': 1,
  third: 2, '3rd': 2,
  fourth: 3, '4th': 3,
};

// ─── Action detection (pure regex, no LLM) ────────────────────────────────────

function detectAction(q: string): AgentAction | null {
  if (/\bcompare\b/i.test(q)) return 'compare';
  if (/\badd\s+(?:that|it|this|the\s+\w+)\s+to\s+(?:my\s+)?cart\b/i.test(q)) return 'add_to_cart';
  if (/\badd\s+to\s+(?:my\s+)?cart\b/i.test(q)) return 'add_to_cart';
  if (/\b(cheaper|less expensive|lower price|more affordable|budget option)\b/i.test(q)) return 'show_cheaper';
  if (/\b(more expensive|higher.end|premium|luxury|pricier)\b/i.test(q)) return 'show_more_expensive';
  if (/\b(show more|more options|see more|what else|other options)\b/i.test(q)) return 'show_more';
  if (/\b(go to|take me to|navigate to|browse to)\b/i.test(q)) return 'navigate';
  return null;
}

// ─── Reference resolution ─────────────────────────────────────────────────────

interface RefResult { referenceIndex?: number; referenceIndices?: number[] }

function resolveReferences(q: string): RefResult {
  const lq = q.toLowerCase();

  // "compare the first two" / "compare first and second"
  if (/compare\s+(?:the\s+)?(?:first\s+two|1st\s+and\s+2nd|first\s+and\s+second)/.test(lq))
    return { referenceIndices: [0, 1] };

  // "compare them" / "compare both"
  if (/compare\s+(?:them|both|all)/.test(lq)) return { referenceIndices: [0, 1] };

  // "compare the second and third"
  const namedCmp = lq.match(/compare\s+(?:the\s+)?(\w+)\s+(?:and|&)\s+(?:the\s+)?(\w+)/);
  if (namedCmp && ORDINALS[namedCmp[1]] !== undefined && ORDINALS[namedCmp[2]] !== undefined)
    return { referenceIndices: [ORDINALS[namedCmp[1]], ORDINALS[namedCmp[2]]] };

  // "the first one" / "the second option"
  const ordM = lq.match(/(?:the\s+)?(\w+)\s+(?:one|option|item|product)/);
  if (ordM && ORDINALS[ordM[1]] !== undefined) return { referenceIndex: ORDINALS[ordM[1]] };

  // "that" / "it" / implicit
  if (/\b(that|it|this)\b/.test(lq)) return { referenceIndex: 0 };

  return {};
}

// ─── Price extraction ─────────────────────────────────────────────────────────

function extractPrice(q: string): PriceConstraint | undefined {
  const cur = 'USD';
  const under = q.match(/\b(?:under|less\s+than|below|max(?:imum)?|at\s+most)\s+\$?(\d+(?:\.\d{1,2})?)/i);
  if (under) return { max: +under[1], currency: cur };
  const over = q.match(/\b(?:over|more\s+than|above|min(?:imum)?|at\s+least)\s+\$?(\d+(?:\.\d{1,2})?)/i);
  if (over) return { min: +over[1], currency: cur };
  const around = q.match(/\b(?:around|about|roughly|approximately|~)\s+\$?(\d+(?:\.\d{1,2})?)/i);
  if (around) return { around: +around[1], currency: cur };
  const range = q.match(/\$?(\d+(?:\.\d{1,2})?)\s*(?:to|-)\s*\$?(\d+(?:\.\d{1,2})?)/i);
  if (range) return { min: +range[1], max: +range[2], currency: cur };
  const budget = q.match(/\bbudget\s+(?:of\s+)?\$?(\d+(?:\.\d{1,2})?)/i);
  if (budget) return { max: +budget[1], currency: cur };
  return undefined;
}

// ─── Fast path ────────────────────────────────────────────────────────────────

function tryFastParse(q: string): Partial<ParsedIntent> | null {
  const action = detectAction(q);
  if (!action) return null;

  const refs = resolveReferences(q);
  if (action === 'compare' && !refs.referenceIndices) refs.referenceIndices = [0, 1];
  if (action === 'add_to_cart' && refs.referenceIndex === undefined) refs.referenceIndex = 0;

  return { action, attributes: [], ...refs };
}

// ─── Groq slow path ───────────────────────────────────────────────────────────

async function groqParse(q: string, history: ConversationMessage[]): Promise<Partial<ParsedIntent>> {
  const ctxLines = history.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

  const system = `You are a shopping intent extraction engine. Return ONLY valid JSON (no markdown):
{
  "action": "search|compare|add_to_cart|show_cheaper|show_more_expensive|show_more|navigate|clarify|chitchat",
  "category": "product type in plain English or null",
  "attributes": ["specific requirements not already in category"],
  "needsClarification": false,
  "clarificationPrompt": "question to ask shopper or null",
  "confidence": "high|medium|low"
}`;

  const msgs: Groq.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  if (ctxLines) msgs.push({ role: 'user', content: `Conversation:\n${ctxLines}` });
  msgs.push({ role: 'user', content: `Extract intent from: "${q}"` });

  try {
    const resp = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? 'llama3-8b-8192',
      messages: msgs,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    const p = JSON.parse(resp.choices[0]?.message?.content ?? '{}');
    return {
      action: (p.action as AgentAction) ?? 'search',
      category: p.category ?? undefined,
      attributes: Array.isArray(p.attributes) ? p.attributes : [],
      confidence: (['high','medium','low'].includes(p.confidence) ? p.confidence : 'medium') as 'high'|'medium'|'low',
      needsClarification: Boolean(p.needsClarification),
      clarificationPrompt: p.clarificationPrompt ?? undefined,
    };
  } catch {
    return { action: 'search', attributes: [], confidence: 'low', needsClarification: false };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

export async function parseIntent(
  query: string,
  conversationHistory: ConversationMessage[] = [],
): Promise<ParsedIntent> {
  const q = query.trim();
  const price = extractPrice(q);
  const fast = tryFastParse(q);

  if (fast) {
    return {
      raw: q,
      action: fast.action!,
      priceConstraint: price ?? fast.priceConstraint,
      attributes: fast.attributes ?? [],
      referenceIndex: fast.referenceIndex,
      referenceIndices: fast.referenceIndices,
      confidence: 'high',
      needsClarification: false,
    };
  }

  const slow = await groqParse(q, conversationHistory);
  return {
    raw: q,
    action: slow.action ?? 'search',
    category: slow.category,
    priceConstraint: price ?? slow.priceConstraint,
    attributes: slow.attributes ?? [],
    confidence: slow.confidence ?? 'medium',
    needsClarification: slow.needsClarification ?? false,
    clarificationPrompt: slow.clarificationPrompt,
  };
}

// ─── Voice helper ─────────────────────────────────────────────────────────────

const SHOPPING_KEYWORDS = [
  'find', 'search', 'look for', 'show me', 'buy', 'add to cart',
  'compare', 'price', 'cheap', 'affordable', 'under $', 'under £',
  'product', 'item', 'recommend', 'suggestion', 'what do you have',
  'do you have', 'available', 'in stock', 'color', 'colour', 'size',
  'style', 'brand', 'material', 'category', 'collection', 'sale',
  'discount', 'deal', 'shipping', 'deliver',
];

/** Returns true when the transcript appears to be a shopping-related request. */
export function isShoppingRequest(transcript: string): boolean {
  const t = transcript.toLowerCase();
  return SHOPPING_KEYWORDS.some(kw => t.includes(kw));
}
