// ============================================================================
// MSWIM-tier directives — Phase 2.2.
//
// The voice/agent system prompt is composed of two parts:
//   1. A static "you are AVA" header (tone + format rules).
//   2. A tier-specific directive (this module) that scales the agent's
//      assertiveness with the shopper's MSWIM composite score.
//
// The tier comes from the latest Evaluation row for the session. When no
// evaluation exists yet (first turn of a new session) the default is PASSIVE
// — helpful but reserved. Aligns with CLAUDE.md tier bands:
//
//   0-29   MONITOR    silent observation
//   30-49  PASSIVE    gentle suggestions when asked
//   50-64  NUDGE      proactive but light
//   65-79  ACTIVE     confident, action-oriented
//   80+    ESCALATE   urgent recovery
//
// Pure module. No I/O. Easy to unit-test.
// ============================================================================

export type MswimTier = "MONITOR" | "PASSIVE" | "NUDGE" | "ACTIVE" | "ESCALATE";

const DIRECTIVES: Record<MswimTier, string> = {
  MONITOR:
    "MSWIM tier: MONITOR. The shopper is browsing calmly. Acknowledge briefly. " +
    "Do not push products or upsell — answer only what was asked, in one short sentence.",
  PASSIVE:
    "MSWIM tier: PASSIVE. Be gentle and supportive. Offer help only when the " +
    "shopper clearly signals interest. Avoid suggesting next steps unprompted.",
  NUDGE:
    "MSWIM tier: NUDGE. The shopper is engaged and receptive. Be warm and " +
    "helpful — when relevant, offer ONE specific next step (e.g. \"want to see " +
    "similar styles?\"). Never pushy. One suggestion at most.",
  ACTIVE:
    "MSWIM tier: ACTIVE. The shopper has clear intent. Be confident and " +
    "action-oriented. Recommend a specific product or action. Use direct phrasing " +
    "(e.g. \"I'd go with the linen one — want me to add it to your cart?\").",
  ESCALATE:
    "MSWIM tier: ESCALATE. The shopper is at high risk of leaving (cart " +
    "abandonment, repeated friction, long hesitation). Address their likely " +
    "objection directly and offer a clear, single next step. Be urgent but warm — " +
    "do not stack questions.",
};

/**
 * Return the directive string for the given tier, defaulting to PASSIVE when
 * no tier is known yet (first turn of a session before any evaluation has run).
 */
export function tierDirective(tier: MswimTier | string | null | undefined): string {
  if (!tier) return DIRECTIVES.PASSIVE;
  if (tier in DIRECTIVES) return DIRECTIVES[tier as MswimTier];
  return DIRECTIVES.PASSIVE;
}

/** Narrow an arbitrary string to a known MswimTier or null. */
export function asMswimTier(value: string | null | undefined): MswimTier | null {
  if (!value) return null;
  return value in DIRECTIVES ? (value as MswimTier) : null;
}

/** Exposed for tests + the shopping-agent narration helper. */
export const KNOWN_TIERS: MswimTier[] = ["MONITOR", "PASSIVE", "NUDGE", "ACTIVE", "ESCALATE"];
