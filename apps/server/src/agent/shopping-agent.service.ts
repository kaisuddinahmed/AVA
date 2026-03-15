// ============================================================================
// Shopping Agent Service — orchestrates product discovery + TTS narration.
//
// Called from voice-responder.service.ts when a voice transcript is classified
// as a shopping request (product_search, compare, add_to_cart, more_like_this).
//
// Returns an intervention payload with:
//   - products?: ProductCard[]       — search results
//   - comparison?: ComparisonCard    — side-by-side comparison
//   - message: string                — TTS narration text
//   - voice_script: string           — ≤80-char version for TTS
//   - action_code: string            — "AGENT_ACTION" for training capture
// ============================================================================

import Groq from "groq-sdk";
import { config } from "../config.js";
import { EvaluationRepo, InterventionRepo, SessionRepo } from "@ava/db";
import { broadcastToSession } from "../broadcast/broadcast.service.js";
import {
  parseIntent,
  type ShoppingIntent,
} from "./intent-parser.js";
import {
  searchProducts,
  buildComparisonCard,
  type ProductCard,
  type ComparisonCard,
} from "./product-search-adapter.js";

const groq = new Groq({ apiKey: config.groq.apiKey });

// In-memory: last search results per session (for "compare the first two", "add that")
const lastSearchResults = new Map<string, ProductCard[]>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface PageContext {
  page_type?: string;
  page_url?: string;
  siteUrl?: string;
}

export interface AgentResponse {
  message: string;
  voice_script: string;
  products?: ProductCard[];
  comparison?: ComparisonCard;
  action_code: string;
  intervention_type: "nudge" | "active";
}

/**
 * Handle a shopping-intent voice query.
 * Returns a fully-formed intervention payload ready for broadcast.
 */
export async function handleShoppingQuery(
  sessionId: string,
  transcript: string,
  pageCtx?: PageContext,
): Promise<AgentResponse> {
  const intent = parseIntent(transcript);
  const siteUrl = pageCtx?.siteUrl ?? "";

  switch (intent.actionType) {
    case "product_search":
    case "more_like_this":
      return handleProductSearch(sessionId, intent, siteUrl);

    case "compare":
      return handleCompare(sessionId, intent);

    case "add_to_cart":
      return handleAddToCart(sessionId, intent);

    default:
      // Shouldn't reach here — caller checks isShoppingRequest() first
      return {
        message: "Let me help you find what you need.",
        voice_script: "Let me help you find what you need.",
        action_code: "AGENT_ACTION",
        intervention_type: "nudge",
      };
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleProductSearch(
  sessionId: string,
  intent: ShoppingIntent,
  siteUrl: string,
): Promise<AgentResponse> {
  const result = await searchProducts(siteUrl, intent, 3);
  const { products, query } = result;

  // Persist last results for follow-up commands
  if (products.length > 0) {
    lastSearchResults.set(sessionId, products);
  }

  if (products.length === 0) {
    return {
      message: `I couldn't find ${intent.category ?? "products"} matching your request. Try browsing the category page or use the site's search bar.`,
      voice_script: `I couldn't find matching results. Try the search bar.`,
      action_code: "AGENT_ACTION",
      intervention_type: "nudge",
    };
  }

  // Build narration with Groq (brief, ≤2 sentences)
  const narration = await buildSearchNarration(query, products);

  return {
    message: narration.full,
    voice_script: narration.brief,
    products,
    action_code: "AGENT_ACTION",
    intervention_type: "active",
  };
}

async function handleCompare(sessionId: string, intent: ShoppingIntent): Promise<AgentResponse> {
  const previous = lastSearchResults.get(sessionId) ?? [];

  // Resolve which two products to compare
  let a: ProductCard | undefined;
  let b: ProductCard | undefined;

  if (intent.referenceIndex !== undefined) {
    // "compare the first and second"
    a = previous[0];
    b = previous[1];
  } else {
    // default: compare top 2 from last search
    [a, b] = previous;
  }

  if (!a || !b) {
    return {
      message: "I need to find some products first. What are you looking for?",
      voice_script: "What products would you like me to find first?",
      action_code: "AGENT_ACTION",
      intervention_type: "nudge",
    };
  }

  const comparison = buildComparisonCard(a, b);
  const recommended = comparison.recommendation
    ? (comparison.products.find((p) => p.product_id === comparison.recommendation!.product_id)?.title ?? "the first option")
    : a.title;

  const message = `Here's a side-by-side comparison. Based on rating and value, I'd recommend ${recommended}.`;
  const voice_script = `I'd recommend ${recommended.slice(0, 50)}.`;

  return {
    message,
    voice_script,
    comparison,
    action_code: "AGENT_ACTION",
    intervention_type: "active",
  };
}

async function handleAddToCart(sessionId: string, intent: ShoppingIntent): Promise<AgentResponse> {
  const previous = lastSearchResults.get(sessionId) ?? [];
  const targetIdx = (intent.referenceIndex ?? 1) - 1;
  const product = previous[targetIdx];

  if (!product) {
    return {
      message: "Which product would you like to add? Say 'the first one' or 'the second one'.",
      voice_script: "Which product would you like to add?",
      action_code: "AGENT_ACTION",
      intervention_type: "nudge",
    };
  }

  // Widget receives this and fires an add-to-cart action using verified selectors
  return {
    message: `Adding ${product.title} to your cart now.`,
    voice_script: `Adding ${product.title.slice(0, 40)} to your cart.`,
    products: [product],  // single product = widget knows to ATC it
    action_code: "AGENT_ADD_TO_CART",
    intervention_type: "active",
  };
}

// ---------------------------------------------------------------------------
// Narration builder
// ---------------------------------------------------------------------------

async function buildSearchNarration(
  query: string,
  products: ProductCard[],
): Promise<{ full: string; brief: string }> {
  const productList = products
    .slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.title} ($${p.price.toFixed(2)})`)
    .join("; ");

  let full = `I found ${products.length} option${products.length > 1 ? "s" : ""} for "${query}": ${productList}.`;
  let brief = `I found ${products.length} option${products.length > 1 ? "s" : ""} for ${query}.`;

  if (!config.groq.apiKey) return { full, brief };

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        {
          role: "system",
          content:
            "You are AVA, a shopping assistant. Narrate a product search result in 1-2 sentences, warm and helpful. Keep it under 50 words. Mention the best match by name.",
        },
        {
          role: "user",
          content: `Products found for "${query}": ${productList}. Best match: ${products[0]?.title}.`,
        },
      ],
      max_tokens: 80,
      temperature: 0.5,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (raw) {
      full = raw;
      const firstSentence = raw.split(/(?<=[.!?])\s/)[0] ?? raw;
      brief = firstSentence.length > 80 ? firstSentence.slice(0, 77) + "…" : firstSentence;
    }
  } catch {
    // Use rule-based fallback
  }

  return { full, brief };
}

// ---------------------------------------------------------------------------
// Broadcast helper — wraps agent response as an intervention and broadcasts
// ---------------------------------------------------------------------------

const AGENT_WEIGHTS = JSON.stringify({ intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.20, value: 0.15 });

export async function broadcastAgentResponse(
  sessionId: string,
  response: AgentResponse,
  voicePlayback: boolean,
): Promise<string> {
  const payload = {
    type: response.intervention_type,
    action_code: response.action_code,
    friction_id: "F036",
    message: response.message,
    products: response.products,
    comparison: response.comparison,
    voice_enabled: voicePlayback,
    voice_script: voicePlayback ? response.voice_script : undefined,
  };

  let interventionId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const evaluation = await EvaluationRepo.createEvaluation({
      sessionId,
      eventBatchIds: "[]",
      narrative: `Agent: ${response.action_code}`,
      frictionsFound: '["F036"]',
      intentScore: 75,
      frictionScore: 30,
      clarityScore: 80,
      receptivityScore: 85,
      valueScore: 70,
      compositeScore: 68,
      weightsUsed: AGENT_WEIGHTS,
      tier: "ACTIVE",
      decision: "fire",
      reasoning: `Shopping agent action: ${response.action_code}`,
    });

    const intervention = await InterventionRepo.createIntervention({
      sessionId,
      evaluationId: evaluation.id,
      type: response.intervention_type,
      actionCode: response.action_code,
      frictionId: "F036",
      payload: JSON.stringify(payload),
      mswimScoreAtFire: 68,
      tierAtFire: "ACTIVE",
    });

    interventionId = intervention.id;
    SessionRepo.incrementVoiceInterventionsFired(sessionId).catch(() => {});
  } catch (err) {
    console.error("[ShoppingAgent] DB persist error:", err);
  }

  broadcastToSession("widget", sessionId, {
    type: "intervention",
    sessionId,
    payload: { ...payload, intervention_id: interventionId },
  });

  return interventionId;
}

/**
 * Clear session state when session ends.
 */
export function clearAgentState(sessionId: string): void {
  lastSearchResults.delete(sessionId);
}
