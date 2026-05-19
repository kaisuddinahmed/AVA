// ============================================================================
// VisitorMind types — shared between server (think/, evaluate/) and dashboard.
//
// The persistent mental model the virtual salesperson holds about each
// visitor. Updated every evaluate cycle, read by think/ before deciding the
// next SalespersonMove. See packages/db/prisma/schema.prisma#VisitorMind.
// ============================================================================

/** Current mood of the visitor — trajectory-aware over moodHistory. */
export type Mood =
  | "unknown"
  | "confident"
  | "engaged"
  | "hesitant"
  | "frustrated"
  | "leaving";

/** A single mood transition with the evidence that triggered it. */
export interface MoodTransition {
  mood: Mood;
  ts: number;          // epoch ms
  evidence: string;    // short prose, e.g. "MSWIM friction 78, exit_intent fired"
}

/** Coarse persona hint inferred over the session. */
export type PersonaHint =
  | "deal_hunter"
  | "researcher"
  | "impulse"
  | "gift_buyer"
  | "returning_loyal";

/** Objection categories the salesperson recognizes. */
export type ObjectionType =
  | "price"
  | "fit"
  | "trust"
  | "delivery"
  | "choice"
  | "timing";

/** An inferred objection with provenance. */
export interface InferredObjection {
  type: ObjectionType;
  confidence: number;   // 0-1
  evidence: string[];   // short strings; e.g. ["F060 price_copy", "STT: too expensive"]
  ts: number;           // epoch ms
}

/** Engagement score per SKU. Stored as JSON object on the row. */
export type InterestPerProduct = Record<string, number>; // sku -> 0-100

/** The runtime shape of a VisitorMind row after JSON deserialization. */
export interface VisitorMindView {
  sessionId: string;
  siteUrl: string;
  mood: Mood;
  moodHistory: MoodTransition[];
  interestPerProduct: InterestPerProduct;
  inferredObjections: InferredObjection[];
  decisionPressure: number;     // 0-100
  comparisonSet: string[];      // SKUs
  priceSensitivity: number;     // 0-100
  personaHint: PersonaHint | null;
  confidence: number;           // 0-100
  lastEvaluationId: string | null;
  evaluationsConsidered: number;
  updatedAt: Date;
}

/** Bounds enforced by the repo to keep row size sane. */
export const VISITOR_MIND_BOUNDS = {
  MAX_MOOD_HISTORY: 20,
  MAX_INFERRED_OBJECTIONS: 10,
  MAX_COMPARISON_SET: 30,
  MAX_INTEREST_KEYS: 50,
} as const;
