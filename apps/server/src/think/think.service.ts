// ============================================================================
// think.service — the salesperson's decide step.
//
// STEP 2 (2026-05-19) — passthrough.
//
// Behavior parity contract: for any (frictionId, frictionIds) combo where
// pickPlaybookForFrictions used to return a playbook, decideMove returns a
// SalespersonMove whose voice_script / sales_dialog / playbook_objective
// match selectStep(playbook, 0). For all other inputs, the move carries
// null voice content (caller — payload-builder.ts — falls back to the
// generic message template, same as before).
//
// Why a passthrough first: the wider surface (VisitorMind, ConversationState,
// SiteCatalog, MerchantCoachingConfig) gets wired in steps 3-9. By
// introducing the SalespersonMove shape now, every downstream change is
// additive to a known boundary instead of a re-plumb of payload-builder.
// ============================================================================

import {
  pickPlaybookForFrictions,
  selectStep,
  type Playbook,
  type PlaybookStep,
} from "../voice/sales-playbooks.js";
import type {
  SalespersonMove,
  ThinkInput,
  MoveTone,
  MoveIntent,
  ObjectionType,
  ExpectedResponse,
} from "./think.types.js";
import {
  llmThink,
  isLlmThinkingEnabled,
  type LlmThinkInput,
} from "./llm-thinker.js";

/**
 * Decide the next salesperson move.
 *
 * Step 2 is deliberately deterministic and side-effect free — pure function
 * over its inputs. Steps 3-6 introduce reads of VisitorMind /
 * ConversationState and an optional LLM call; the boundary established
 * here is what those changes plug into.
 */
export function decideMove(input: ThinkInput): SalespersonMove {
  const playbook = pickPlaybookForFrictions(input.frictionIds);
  const pick = playbook
    ? pickContextualStep(playbook, input.liveObjections ?? [], input.turnIndex ?? 0)
    : null;
  const step = pick?.step ?? null;

  const tactic_id = playbook && pick
    ? `${playbook.frictionId}_step${pick.index}`
    : null;

  // Codex P2.5 — confidence reflects how well the rule path matched.
  const confidence = scoreRuleConfidence({
    matched: !!playbook,
    matchedByObjection: !!pick?.matchedByObjection,
    turnIndex: input.turnIndex ?? 0,
  });

  // Codex P2.4 fix (2026-05-19) — populate the prediction fields on
  // rule-based moves so MoveOutcome resolution has something to score
  // against. Previously these were always null and accuracy was thin.
  const intent = step?.intent ?? null;
  const expected_visitor_response = intent
    ? predictResponseFromIntent(intent)
    : null;
  const next_state_hypothesis = intent
    ? predictNextState(intent, input.tier)
    : null;

  return {
    // Step 3 (2026-05-19) — intent and objection_type now flow from the
    // playbook step. When no playbook matches, both stay null (caller
    // falls back to generic templates that have no intent metadata).
    intent,
    objection_type: step?.objection_type ?? null,

    tactic_id,
    voice_script: step?.voice_script ?? null,
    sales_dialog: step?.sales_dialog ?? null,
    playbook_objective: step?.objective ?? null,

    tone: defaultToneForTier(input.tier),

    expected_visitor_response,
    next_state_hypothesis,

    attribution_tag: `${input.frictionId}:${input.actionCode}:passthrough`,
    confidence,
  };
}

/**
 * Step 6 (2026-05-19) — async variant that augments the rule-based move
 * with an LLM-generated SalespersonMove when (a) no playbook matched, and
 * (b) the tier is high-stakes (ACTIVE / ESCALATE), and (c) the LLM
 * thinking path is enabled + budget remains.
 *
 * Never throws. On any failure (timeout, validation, budget exhausted,
 * disabled flag), returns the rule-based move unchanged. The rule-based
 * path is the safety net; the LLM only ever upgrades a no-playbook
 * fallback.
 */
export async function decideMoveAsync(
  input: ThinkInput,
  llmInput?: Omit<LlmThinkInput, "frictionId" | "frictionIds" | "tier">,
): Promise<SalespersonMove> {
  const ruleMove = decideMove(input);

  // Codex P2.5 fix (2026-05-19) — escalate when the rule path is a weak
  // fit (confidence < 0.7), not only when there's no playbook at all.
  // This covers situations where a playbook nominally matches but no
  // live signal helped pick a step.
  const isHighStakes = input.tier === "ACTIVE" || input.tier === "ESCALATE";
  const lowConfidence = ruleMove.confidence < RULE_CONFIDENCE_LLM_THRESHOLD;
  const needsLlm = isHighStakes && lowConfidence;
  if (!needsLlm) return ruleMove;
  if (!isLlmThinkingEnabled()) return ruleMove;
  if (!llmInput) return ruleMove;

  const llmMove = await llmThink({
    ...llmInput,
    frictionId: input.frictionId,
    frictionIds: input.frictionIds,
    tier: input.tier,
  });

  if (!llmMove) return ruleMove;
  // LLM was explicitly invoked → mark the move high-confidence so the
  // outcome layer attributes it correctly.
  return { ...llmMove, confidence: 1.0 };
}

/** Codex P2.5 — escalation threshold. Tune as data arrives. */
export const RULE_CONFIDENCE_LLM_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Step 4 (2026-05-19) — content-based step selection.
 *
 * Selection order:
 *   1. If a live objection has a matching `objection_type` step in the
 *      playbook, pick that step. Live objections are pre-sorted by
 *      confidence by the context loader.
 *   2. Fall back to turn-count modulo cycling (parity with the legacy
 *      `selectStep(playbook, turnIndex)` path).
 *
 * This replaces the bug behavior of repeating the same step every N turns
 * regardless of what the visitor actually objected to.
 */
function pickContextualStep(
  playbook: Playbook,
  liveObjections: readonly ObjectionType[],
  turnIndex: number,
): { step: PlaybookStep; index: number; matchedByObjection: boolean } {
  for (const objection of liveObjections) {
    const idx = playbook.steps.findIndex(
      (s) => s.objection_type === objection,
    );
    if (idx >= 0) {
      return { step: playbook.steps[idx], index: idx, matchedByObjection: true };
    }
  }
  const index =
    playbook.steps.length === 0 ? 0 : turnIndex % playbook.steps.length;
  return {
    step: selectStep(playbook, turnIndex),
    index,
    matchedByObjection: false,
  };
}

/**
 * Rule-confidence scoring (0..1). Drives the LLM escalation gate in
 * `decideMoveAsync`. Hand-tuned weights — fine to adjust as data arrives.
 */
function scoreRuleConfidence(args: {
  matched: boolean;
  matchedByObjection: boolean;
  turnIndex: number;
}): number {
  if (!args.matched) return 0;
  if (args.matchedByObjection) return 0.85;
  // No live objection match — opener at turn 0 is OK, but a deeper turn
  // index with no specific signal is a weaker fit.
  if (args.turnIndex === 0) return 0.6;
  return 0.5;
}

/**
 * Tier → default tone. Conservative defaults so the passthrough emits the
 * same effective behavior as before (where tone wasn't expressed). Later
 * playbooks may override per-step.
 */
function defaultToneForTier(tier: string): MoveTone {
  switch (tier) {
    case "ESCALATE":
      return "urgent";
    case "ACTIVE":
      return "confident";
    case "NUDGE":
      return "warm";
    case "PASSIVE":
    case "MONITOR":
    default:
      return "warm";
  }
}

/**
 * Intent → expected visitor response. The salesperson's bet on what the
 * visitor will do if the move lands. Used by MoveOutcome resolution to
 * score accuracy.
 */
export function predictResponseFromIntent(intent: MoveIntent): ExpectedResponse {
  switch (intent) {
    case "greet":
    case "clarify":
    case "objection_handle":
      return "ask_followup";
    case "highlight":
    case "urgency":
    case "close":
    case "recover":
      return "click_cta";
    case "wait":
      return "ignore";
    default:
      return "ask_followup";
  }
}

/**
 * Intent + current tier → next-state hypothesis. The hypothesis reflects
 * what we expect when the move succeeds: friction drops, the visitor
 * mood improves a notch, MSWIM tier softens.
 */
export function predictNextState(
  intent: MoveIntent,
  currentTier: string,
): { tier: string; mood: string } {
  return {
    tier: softerTier(currentTier),
    mood: predictedMood(intent),
  };
}

function softerTier(tier: string): string {
  switch (tier) {
    case "ESCALATE": return "ACTIVE";
    case "ACTIVE":   return "NUDGE";
    case "NUDGE":    return "PASSIVE";
    case "PASSIVE":  return "MONITOR";
    default:         return tier;
  }
}

function predictedMood(intent: MoveIntent): string {
  switch (intent) {
    case "close":
      return "confident";
    case "greet":
    case "clarify":
    case "highlight":
    case "objection_handle":
    case "urgency":
    case "recover":
      return "engaged";
    case "wait":
      return "unknown";
    default:
      return "engaged";
  }
}
