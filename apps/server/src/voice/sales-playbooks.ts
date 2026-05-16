// ============================================================================
// F-code sales playbooks — Phase 2.3.
//
// Curated dialog flows for common friction codes. Each step carries:
//
//   - `voice_script` (string, ≤80 chars) — exact words spoken via TTS. The
//     80-char ceiling is the same one in CLAUDE.md's hard rules: keeps
//     TTS pacing natural, no audio mid-sentence cutoff.
//
//   - `sales_dialog` (string, ≤500 chars) — richer internal context shown
//     as the chat-bubble message. Per Codex Phase 2.3 wording: "sales_dialog
//     can contain multi-step dialogue, emitted as ≤80-char spoken chunks."
//     The bubble text and the spoken text are intentionally allowed to
//     differ in length; both reinforce the same recovery angle.
//
//   - `objective` (string) — what this step is trying to accomplish.
//     Surfaced into the payload for analytics + dashboard transparency.
//
// Module-load invariant: every voice_script in every playbook is asserted to
// be ≤80 chars. If you add a step, the assertion will fail at boot if you
// blow the budget. No surprises.
// ============================================================================

export interface PlaybookStep {
  /** Spoken via TTS — capped at 80 chars (CLAUDE.md hard rule). */
  voice_script: string;
  /** Richer bubble text — up to 500 chars. */
  sales_dialog: string;
  /** What this step intends to do. */
  objective: string;
}

export interface Playbook {
  /** F-code this playbook addresses, e.g. "F042". */
  frictionId: string;
  /** Short human label. */
  name: string;
  /** Ordered dialog steps. First step is the opener. */
  steps: PlaybookStep[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PLAYBOOKS: Record<string, Playbook> = {
  // F020 — Pogo-sticking (user can't find what they need).
  F020: {
    frictionId: "F020",
    name: "Lost-in-navigation recovery",
    steps: [
      {
        voice_script: "Looks like you're hunting for something — want a hand?",
        sales_dialog:
          "I notice you've been bouncing between pages. Want me to help narrow this down? " +
          "Tell me what you're looking for in your own words — colour, size, occasion — and I'll pull a short list.",
        objective: "Acknowledge friction; offer guided search.",
      },
    ],
  },

  // F036 — Searched for return/refund/cancel — proactive support angle.
  F036: {
    frictionId: "F036",
    name: "Returns-policy support",
    steps: [
      {
        voice_script: "Quick on returns — 30 days, free label. Want the link?",
        sales_dialog:
          "Looking for return info? We offer free returns within 30 days of delivery — the label's prepaid. " +
          "Want me to pull up the policy or help with a specific order?",
        objective: "Defuse return anxiety; offer policy / order help.",
      },
    ],
  },

  // F042 — Viewed PDP but left quickly (<10s). Re-engagement.
  F042: {
    frictionId: "F042",
    name: "PDP early-exit recovery",
    steps: [
      {
        voice_script: "Saw you peek at that one — want me to find similar styles?",
        sales_dialog:
          "Didn't quite click? I can find similar options at the same price point, or filter for a different colour. " +
          "What didn't work about this one?",
        objective: "Re-engage on alternatives; uncover the real objection.",
      },
      {
        voice_script: "Same vibe, different price — want me to pull a few?",
        sales_dialog:
          "I can show you 3-4 similar styles across price ranges if budget is the question. Just say the word.",
        objective: "Frame as budget-aware comparison.",
      },
    ],
  },

  // F099 — Empty promo-code hunt. Save the sale.
  F099: {
    frictionId: "F099",
    name: "Promo-code save",
    steps: [
      {
        voice_script: "No code? I can apply the best running offer right now.",
        sales_dialog:
          "No code on hand? I'll apply the best active promo to your cart automatically — just say yes and " +
          "I'll let you know what came off.",
        objective: "Prevent code-hunt abandonment.",
      },
    ],
  },

  // F100 — Shipping option overload. Simplify.
  F100: {
    frictionId: "F100",
    name: "Shipping option simplifier",
    steps: [
      {
        voice_script: "Standard ships free in 3–5 days. Want me to pick it?",
        sales_dialog:
          "Most shoppers go with standard — free, 3-5 business days. Want me to set that and move you to payment? " +
          "Express is +$8 for 2-day if you're in a rush.",
        objective: "Collapse the choice; offer concrete recommendation.",
      },
    ],
  },

  // F128 — Subscription vs one-time pricing confusion.
  F128: {
    frictionId: "F128",
    name: "Subscription price clarifier",
    steps: [
      {
        voice_script: "Subscribe saves about 15% — cancel anytime. Worth a look?",
        sales_dialog:
          "Subscribe & Save is roughly 15% off and you can cancel after one delivery — no commitment. " +
          "One-time is the regular price. Want me to apply the subscribe rate?",
        objective: "Make the savings concrete; reassure on cancel flexibility.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Module-load invariant — voice_script length budget.
// ---------------------------------------------------------------------------

const VOICE_SCRIPT_MAX = 80;
const SALES_DIALOG_MAX = 500;

(function assertBudget() {
  for (const pb of Object.values(PLAYBOOKS)) {
    for (let i = 0; i < pb.steps.length; i++) {
      const s = pb.steps[i];
      if (s.voice_script.length > VOICE_SCRIPT_MAX) {
        throw new Error(
          `[sales-playbooks] ${pb.frictionId} step ${i} voice_script is ` +
          `${s.voice_script.length} chars (max ${VOICE_SCRIPT_MAX}): "${s.voice_script}"`,
        );
      }
      if (s.sales_dialog.length > SALES_DIALOG_MAX) {
        throw new Error(
          `[sales-playbooks] ${pb.frictionId} step ${i} sales_dialog is ` +
          `${s.sales_dialog.length} chars (max ${SALES_DIALOG_MAX})`,
        );
      }
    }
  }
})();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPlaybook(frictionId: string): Playbook | null {
  return PLAYBOOKS[frictionId] ?? null;
}

/**
 * Given a list of active F-codes (e.g. from Evaluation.frictionsFound), return
 * the first playbook we have. Order in the input list matters — the caller
 * should pass frictions sorted by severity.
 */
export function pickPlaybookForFrictions(frictionIds: readonly string[]): Playbook | null {
  for (const f of frictionIds) {
    const pb = PLAYBOOKS[f];
    if (pb) return pb;
  }
  return null;
}

/**
 * Choose which step of a playbook to emit. Uses turn count modulo step count
 * so a long session cycles through alternative angles rather than repeating
 * the opener. Phase 2.3 baseline; richer condition-based selection can come
 * later when we have outcome data to tune it.
 */
export function selectStep(playbook: Playbook, turnCount: number): PlaybookStep {
  const idx = playbook.steps.length === 0 ? 0 : turnCount % playbook.steps.length;
  return playbook.steps[idx];
}

/** Exposed for tests + dashboard. */
export const ALL_PLAYBOOKS: readonly Playbook[] = Object.values(PLAYBOOKS);
export const VOICE_SCRIPT_MAX_CHARS = VOICE_SCRIPT_MAX;
