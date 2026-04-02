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
import type { ParsedIntent, ConversationMessage } from './agent.types.js';
export declare function parseIntent(query: string, conversationHistory?: ConversationMessage[]): Promise<ParsedIntent>;
/** Returns true when the transcript appears to be a shopping-related request. */
export declare function isShoppingRequest(transcript: string): boolean;
//# sourceMappingURL=intent-parser.d.ts.map