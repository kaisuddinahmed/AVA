// ============================================================================
// think/ — the salesperson's brain.
//
// Sits between evaluate/ (perception) and intervene/ (delivery). Reads the
// current evaluation + visitor mind + conversation state and produces a
// SalespersonMove — the explicit decision of what move to make, in what
// tone, with what expected outcome.
//
// Step 2 of the Thinking Layer plan (2026-05-19) — passthrough phase. The
// module mirrors what payload-builder.ts used to do inline: pick the
// playbook for the firing friction, take step 0, return the result wrapped
// in the SalespersonMove shape. Later steps (3, 4, 6) fill in intent,
// objection_type, content-based step selection, and LLM-generated tactics.
// ============================================================================

/**
 * High-level move category. The salesperson's *intent* for this turn.
 * - greet — first contact, set rapport
 * - clarify — answer a confusion / question
 * - highlight — surface a benefit / feature
 * - objection_handle — address a stated or inferred objection
 * - urgency — create soft time / scarcity pressure
 * - close — push for the purchase
 * - recover — re-engage after exit / cart abandonment
 * - wait — observe more before speaking
 */
export type MoveIntent =
  | "greet"
  | "clarify"
  | "highlight"
  | "objection_handle"
  | "urgency"
  | "close"
  | "recover"
  | "wait";

/** Categories of objection the salesperson is equipped to address. */
export type ObjectionType =
  | "price"
  | "fit"
  | "trust"
  | "delivery"
  | "choice"
  | "timing";

/** Tone the voice should adopt. Drives TTS prosody hints in future steps. */
export type MoveTone = "warm" | "urgent" | "reassuring" | "confident";

/** What we'd expect the visitor to do if the move lands. */
export type ExpectedResponse =
  | "click_cta"
  | "ask_followup"
  | "ignore"
  | "leave";

/**
 * The output of think/. Every intervention now flows through a
 * SalespersonMove instead of being assembled ad-hoc in payload-builder.ts.
 *
 * Fields that are null on a passthrough move (steps 3+ fill them in):
 *   - intent / objection_type — inferred from playbook metadata once
 *     playbooks carry that metadata.
 *   - expected_visitor_response / next_state_hypothesis — populated in step
 *     7 (loop closure) once we measure outcomes.
 */
export interface SalespersonMove {
  /** What the salesperson is trying to do. Null only on legacy fallback. */
  intent: MoveIntent | null;

  /** Specific objection being addressed, when intent === objection_handle. */
  objection_type: ObjectionType | null;

  /**
   * Identifier of the chosen tactic — typically `${frictionId}_step${idx}`
   * for rule-based picks, `LLM_GEN` for step-6 generated moves, or null
   * when there is no playbook for the firing friction (legacy fallback path
   * inside payload-builder.ts).
   */
  tactic_id: string | null;

  /** Spoken via TTS — caller still enforces the 80-char budget. */
  voice_script: string | null;

  /** Richer bubble text — up to 500 chars when a playbook applies. */
  sales_dialog: string | null;

  /** Surfaced into payload for dashboard transparency. */
  playbook_objective: string | null;

  /** Tone the voice should adopt. */
  tone: MoveTone;

  /** Expected outcome — null until step 7 wires the feedback loop. */
  expected_visitor_response: ExpectedResponse | null;

  /**
   * What state we expect the visitor to be in after the move lands.
   * Null until step 7. Drives the predict → measure → learn loop.
   */
  next_state_hypothesis: {
    tier?: string;
    mood?: string;
  } | null;

  /**
   * Free-form tag used for outcome attribution. Step 2 emits
   * `${frictionId}:${actionCode}:passthrough` so analytics can distinguish
   * pre- vs. post-thinking-layer moves.
   */
  attribution_tag: string;

  /**
   * Codex P2.5 (2026-05-19) — rule-based confidence in this move, 0..1.
   *
   * - 0.0       — no playbook matched, generic fallback
   * - ~0.5      — playbook opener used (default step 0, no specific signal)
   * - ~0.6      — playbook + turn-cycle pick (some history, no live signal)
   * - ~0.85+    — live objection matched a step explicitly
   * - 1.0       — LLM-generated (we explicitly invoked the model)
   *
   * `decideMoveAsync` escalates to the LLM when confidence < 0.7 and the
   * tier is high-stakes. This lets the model handle "weak rule fit" cases
   * the playbook catalog can't cover well.
   */
  confidence: number;
}

/**
 * Inputs to decideMove(). Intentionally narrow so the call site
 * (payload-builder.ts) can swap to think/ without restructuring the
 * intervene service.
 */
export interface ThinkInput {
  /** Tier-mapped intervention type. e.g. "passive" | "nudge" | "active". */
  interventionType: string;
  /** Resolved action code from decision-engine. */
  actionCode: string;
  /** Primary firing friction. */
  frictionId: string;
  /** All detected friction IDs, severity-ordered. */
  frictionIds: readonly string[];
  /** MSWIM tier — informs tone in later steps. */
  tier: string;
  /**
   * Turn index for the current dialog. Step 2 ignores this (picks step 0
   * for parity with the prior payload-builder path); step 4 uses it as a
   * fallback when no live objection matches a playbook step.
   */
  turnIndex?: number;

  /**
   * Live objection types ordered by confidence descending (step 4).
   * Sourced from VisitorMind.inferredObjections via
   * loadThinkContext(sessionId). When non-empty and a playbook step
   * matches by objection_type, that step is selected ahead of the
   * turn-count cycle.
   */
  liveObjections?: readonly ObjectionType[];
}
