// ============================================================================
// think/ — context loader.
//
// Bridges the repo layer (VisitorMind, ConversationState) into the
// SalespersonMove decision. Kept as its own module so think.service.ts
// stays pure and side-effect free.
//
// Step 4 (2026-05-19) wiring — populates `liveObjections` from
// VisitorMind.inferredObjections, with a high-confidence threshold so a
// fleeting heuristic doesn't override the turn-count fallback.
// ============================================================================

import { VisitorMindRepo, ConversationStateRepo, MerchantCoachingRepo } from "@ava/db";
import type { ObjectionType } from "./think.types.js";
import type { LlmThinkInput } from "./llm-thinker.js";

/**
 * Live context to drive content-based step selection. Empty fields mean
 * "no signal" — the caller / think.service.ts will fall back to
 * turn-count cycling.
 */
export interface ThinkContext {
  /**
   * Objection categories the salesperson should address. Ordered by
   * confidence descending — pick the first matching playbook step.
   */
  liveObjections: ObjectionType[];

  /**
   * Turn index for the current voice dialog. Sourced from
   * ConversationState.turnCount. Defaults to 0 on a fresh session.
   */
  turnIndex: number;

  /**
   * Step 9 (2026-05-19) — merchant coaching as a prompt fragment.
   * Fed verbatim into the LLM thinker's system context. Null when no
   * coaching is set for this site (or the site is unknown).
   */
  coachingHints: string | null;

  /**
   * Pre-built LLM input fragment. When set, callers can pass it
   * straight to llmThink (sessionId/frictionId/tier still come from
   * the caller). Null when there's no VisitorMind for the session.
   */
  llmInput: Omit<LlmThinkInput, "sessionId" | "frictionId" | "frictionIds" | "tier"> | null;
}

const KNOWN_OBJECTION_TYPES = new Set<ObjectionType>([
  "price",
  "fit",
  "trust",
  "delivery",
  "choice",
  "timing",
]);

/**
 * Threshold below which an inferred objection is ignored. Picked
 * conservatively — step 4 errs on the side of NOT overriding the
 * playbook's turn-count cycling unless the signal is strong.
 */
const MIN_INFERRED_OBJECTION_CONFIDENCE = 0.55;

/**
 * Load the live thinking context for a session. Returns an empty context
 * (no objections, turnIndex=0) when no data is present — the safe default
 * mirrors today's behavior.
 *
 * Defensive: any read error falls back to empty context rather than
 * blocking the intervene path. Voice must not fail because of a
 * VisitorMind lookup glitch.
 */
export async function loadThinkContext(
  sessionId: string,
  opts: { siteUrl?: string } = {},
): Promise<ThinkContext> {
  const [mind, convo, coaching] = await Promise.all([
    safe(() => VisitorMindRepo.getViewBySession(sessionId)),
    safe(() => ConversationStateRepo.getBySession(sessionId)),
    opts.siteUrl
      ? safe(() => MerchantCoachingRepo.getBySite(opts.siteUrl!))
      : Promise.resolve(null),
  ]);

  const liveObjections = mindToObjections(mind);
  const turnIndex = convo?.turnCount ?? 0;
  const coachingHints = coaching
    ? MerchantCoachingRepo.toCoachingHints(coaching)
    : null;

  const llmInput = mind
    ? {
        visitorContext: {
          mood: mind.mood,
          decisionPressure: mind.decisionPressure,
          priceSensitivity: mind.priceSensitivity,
          personaHint: mind.personaHint,
          objections: mind.inferredObjections.map((o) => ({
            type: o.type,
            confidence: o.confidence,
          })),
        },
        coachingHints: coachingHints ?? undefined,
      }
    : null;

  return { liveObjections, turnIndex, coachingHints, llmInput };
}

/**
 * Build ThinkContext from already-loaded inputs. Useful for tests and for
 * callers that have already fetched VisitorMind / ConversationState for
 * other reasons.
 */
export function buildContextFromInputs(opts: {
  inferredObjections?: Array<{ type: string; confidence: number }>;
  turnCount?: number;
  conversationObjections?: string[] | null;
}): ThinkContext {
  const fromMind = (opts.inferredObjections ?? [])
    .filter(
      (o) =>
        o.confidence >= MIN_INFERRED_OBJECTION_CONFIDENCE &&
        KNOWN_OBJECTION_TYPES.has(o.type as ObjectionType),
    )
    .sort((a, b) => b.confidence - a.confidence)
    .map((o) => o.type as ObjectionType);

  // ConversationState.objections is currently free-form strings (legacy);
  // try to map any exact-match objection type names through. STT-derived
  // text falls through step 6's LLM path in a later iteration.
  const fromConvo = (opts.conversationObjections ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ObjectionType =>
      KNOWN_OBJECTION_TYPES.has(s as ObjectionType),
    );

  // De-dup while preserving the mind-first ordering.
  const seen = new Set<ObjectionType>();
  const liveObjections: ObjectionType[] = [];
  for (const o of [...fromMind, ...fromConvo]) {
    if (seen.has(o)) continue;
    seen.add(o);
    liveObjections.push(o);
  }

  return {
    liveObjections,
    turnIndex: opts.turnCount ?? 0,
    coachingHints: null,
    llmInput: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mindToObjections(
  mind: Awaited<ReturnType<typeof VisitorMindRepo.getViewBySession>>,
): ObjectionType[] {
  if (!mind) return [];
  return mind.inferredObjections
    .filter(
      (o) =>
        o.confidence >= MIN_INFERRED_OBJECTION_CONFIDENCE &&
        KNOWN_OBJECTION_TYPES.has(o.type as ObjectionType),
    )
    .sort((a, b) => b.confidence - a.confidence)
    .map((o) => o.type as ObjectionType);
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
