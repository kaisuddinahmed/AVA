/**
 * Shared types — AVA Conversational Shopping Agent (Story 12)
 * Copy to: apps/server/src/agent/agent.types.ts
 */

// ─── Intent ───────────────────────────────────────────────────────────────────

export type AgentAction =
  | 'search'
  | 'compare'
  | 'add_to_cart'
  | 'show_cheaper'
  | 'show_more_expensive'
  | 'show_more'
  | 'navigate'
  | 'clarify'
  | 'chitchat';

export interface PriceConstraint {
  max?: number;
  min?: number;
  around?: number;
  currency: string;
}

export interface ParsedIntent {
  raw: string;
  action: AgentAction;
  category?: string;
  priceConstraint?: PriceConstraint;
  attributes: string[];
  referenceIndex?: number;
  referenceIndices?: number[];
  confidence: 'high' | 'medium' | 'low';
  needsClarification: boolean;
  clarificationPrompt?: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  available: boolean;
}

export interface ProductResult {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  description?: string;
  variants?: ProductVariant[];
  vendor?: string;
  tags?: string[];
  matchScore: number;
  matchedAttributes: string[];
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  timestamp: number;
  products?: ProductResult[];
  action?: AgentAction;
}

export interface PageContext {
  pageType: 'home' | 'product' | 'collection' | 'cart' | 'checkout' | 'search' | 'other';
  pageUrl: string;
  productsInView?: Array<{ id: string; title: string; price: number }>;
  cartContents?: Array<{ id: string; title: string; quantity: number; price: number }>;
  searchQuery?: string;
}

// ─── Agent Response ───────────────────────────────────────────────────────────

export type AgentResponseType =
  | 'products'
  | 'comparison'
  | 'cart_confirm'
  | 'navigate'
  | 'message'
  | 'clarification'
  | 'error';

export interface AgentResponse {
  sessionId: string;
  type: AgentResponseType;
  message: string;
  products?: ProductResult[];
  cartTarget?: {
    product: ProductResult;
    addToCartSelector?: string;
  };
  navigateTo?: string;
  turnIndex: number;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export type AgentActionCode =
  | 'AGENT_SEARCH'
  | 'AGENT_COMPARE'
  | 'AGENT_CART_CONFIRM'
  | 'AGENT_CART_ADD'
  | 'AGENT_NAVIGATE'
  | 'AGENT_CLARIFY'
  | 'AGENT_FALLBACK';

export interface SiteAdapterConfig {
  siteUrl: string;
  platform?: string;
  shopifyStorefrontToken?: string;
  shopifyStoreName?: string;
  searchUrl?: string;
}
