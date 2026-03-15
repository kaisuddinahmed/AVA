// ============================================================================
// Intent Parser — converts a natural-language transcript into a structured
// shopping intent signal for the product search adapter.
//
// Parses: category, price constraints, attribute requirements, action type.
// Zero external deps — pure string analysis with regex heuristics.
// ============================================================================

export type ActionType =
  | "product_search"   // "show me trail shoes"
  | "compare"          // "compare the first two" / "compare X and Y"
  | "add_to_cart"      // "add that to my cart" / "buy the second one"
  | "more_like_this"   // "show me more like that" / "something cheaper"
  | "question";        // everything else — delegate to voice responder

export interface ShoppingIntent {
  actionType: ActionType;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  attributes: string[];  // e.g. ["trail", "overpronation", "waterproof"]
  referenceIndex?: number; // 1-based: "the first one" = 1, "the second" = 2
  raw: string;           // original transcript for fallback
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const PRICE_RE   = /\$(\d+(?:\.\d+)?)/g;
const UNDER_RE   = /under\s+\$?(\d+)|less\s+than\s+\$?(\d+)|cheaper\s+than\s+\$?(\d+)/i;
const OVER_RE    = /over\s+\$?(\d+)|more\s+than\s+\$?(\d+)|at\s+least\s+\$?(\d+)/i;
const ORDINAL_RE = /\b(?:the\s+)?(first|second|third|1st|2nd|3rd|one|two|three)\b/i;
const ORDINAL_MAP: Record<string, number> = {
  first: 1, "1st": 1, one: 1,
  second: 2, "2nd": 2, two: 2,
  third: 3, "3rd": 3, three: 3,
};

const COMPARE_TRIGGERS  = /\b(compar|contrast|vs\.?|versus|side.?by.?side|difference between)\b/i;
const ADD_CART_TRIGGERS = /\b(add.{0,10}(cart|bag)|buy|purchase|order|get (me |that |this |the ))\b/i;
const MORE_LIKE_TRIGGERS = /\b(more like|similar|something (else|cheaper|similar)|show me more|other options)\b/i;
const SEARCH_TRIGGERS   = /\b(find|show|search|look(ing)? for|recommend|suggest|want|need|looking)\b/i;

// Common e-commerce categories for quick matching
const CATEGORY_KEYWORDS: string[] = [
  "shoes", "boots", "sneakers", "sandals", "heels",
  "shirt", "shirts", "dress", "dresses", "pants", "jeans", "jacket", "coat",
  "bag", "bags", "backpack", "wallet", "purse",
  "watch", "watches", "jewelry", "ring", "necklace",
  "laptop", "phone", "headphones", "earbuds", "tablet",
  "chair", "desk", "sofa", "table", "lamp",
  "coffee", "tea", "supplement", "vitamin",
  "toy", "toys", "game", "games",
];

function extractAttributes(text: string): string[] {
  // Extract meaningful adjective-like words (3–20 chars, not stop words)
  const stopWords = new Set([
    "the", "and", "for", "are", "was", "with", "that", "this", "have",
    "not", "but", "from", "they", "will", "one", "two", "all", "been",
    "can", "what", "their", "there", "more", "also", "than", "then",
    "show", "find", "want", "need", "like", "about", "some", "just",
    "good", "best", "nice", "great",
  ]);

  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  return words.filter((w) => w.length >= 3 && w.length <= 20 && !stopWords.has(w));
}

function extractCategory(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    if (lower.includes(cat)) return cat;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a voice/text transcript into a structured ShoppingIntent.
 * Used by the shopping agent to decide which adapter to call.
 */
export function parseIntent(transcript: string): ShoppingIntent {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // ── Determine action type ────────────────────────────────────────────────
  let actionType: ActionType = "question";

  if (ADD_CART_TRIGGERS.test(lower)) {
    actionType = "add_to_cart";
  } else if (COMPARE_TRIGGERS.test(lower)) {
    actionType = "compare";
  } else if (MORE_LIKE_TRIGGERS.test(lower)) {
    actionType = "more_like_this";
  } else if (SEARCH_TRIGGERS.test(lower)) {
    actionType = "product_search";
  }

  // ── Extract price constraints ────────────────────────────────────────────
  let maxPrice: number | undefined;
  let minPrice: number | undefined;

  const underMatch = UNDER_RE.exec(lower);
  if (underMatch) maxPrice = parseFloat(underMatch[1] ?? underMatch[2] ?? underMatch[3] ?? "0");

  const overMatch = OVER_RE.exec(lower);
  if (overMatch) minPrice = parseFloat(overMatch[1] ?? overMatch[2] ?? overMatch[3] ?? "0");

  // Bare "$X" with no qualifier → treat as max price if actionType is search
  if (!maxPrice && !minPrice) {
    const prices: number[] = [];
    let m: RegExpExecArray | null;
    PRICE_RE.lastIndex = 0;
    while ((m = PRICE_RE.exec(t)) !== null) prices.push(parseFloat(m[1]));
    if (prices.length === 1 && actionType === "product_search") maxPrice = prices[0];
  }

  // ── Extract ordinal reference (for compare / add-to-cart) ───────────────
  let referenceIndex: number | undefined;
  const ordinalMatch = ORDINAL_RE.exec(lower);
  if (ordinalMatch) {
    referenceIndex = ORDINAL_MAP[ordinalMatch[1].toLowerCase()];
  }

  // ── Extract category and attributes ─────────────────────────────────────
  const category = extractCategory(lower);
  const attributes = extractAttributes(lower).filter((w) => w !== category);

  return { actionType, category, maxPrice, minPrice, attributes, referenceIndex, raw: t };
}

/**
 * Return true when the transcript looks like a shopping request (not just a question).
 */
export function isShoppingRequest(transcript: string): boolean {
  const intent = parseIntent(transcript);
  return intent.actionType !== "question";
}
