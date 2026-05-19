import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { getMessageTemplate, type SessionContext } from "./message-templates.js";
import {
  extractProductsFromEvents,
  findAlternatives,
  findComplementary,
  buildComparison,
  type ProductSuggestion,
} from "./product-intelligence.js";
import {
  decideMove,
  decideMoveAsync,
  type SalespersonMove,
  type ThinkContext,
} from "../think/index.js";

interface SessionEvent {
  eventType?: string;
  type?: string;
  frictionId?: string | null;
  signals?: Record<string, unknown>;
}

/**
 * Build the intervention payload to send to the widget.
 * sessionEvents is optional — if provided, ACTIVE and ESCALATE payloads
 * will include real product suggestions derived from browsing history.
 * voiceDisabled should be true when the session voice budget is exhausted
 * or the user has muted voice interventions.
 */
/**
 * Build payload and return the SalespersonMove that produced it. Step 7
 * caller (intervene.service.ts) uses this so it can stamp the prediction
 * onto a MoveOutcome row after persisting the intervention. Thin wrappers
 * around this function preserve the old `buildPayload(...) → payload`
 * shape used by the existing test suite.
 *
 * Step 9 (2026-05-19): if a thinkCtx with an llmInput is provided AND the
 * bounded LLM path is enabled, decideMoveAsync may upgrade the move with
 * an LLM-generated SalespersonMove that incorporates merchant coaching.
 * When disabled (default), behavior is identical to the rule-based path.
 */
export async function buildPayloadAndMove(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  sessionEvents?: SessionEvent[],
  voiceDisabled?: boolean,
  sessionCtx?: SessionContext,
  thinkCtx?: ThinkContext,
  sessionIdForLlm?: string,
): Promise<{ payload: Record<string, unknown>; move: SalespersonMove }> {
  // Compute the move first so the payload can read its voice_script /
  // sales_dialog / playbook_objective. When the LLM upgrades the move,
  // the payload reflects the LLM's output.
  const move = await decideMoveAsync(
    {
      interventionType: type,
      actionCode,
      frictionId,
      frictionIds: [frictionId],
      tier: evaluation.tier,
      turnIndex: thinkCtx?.turnIndex ?? 0,
      liveObjections: thinkCtx?.liveObjections,
    },
    thinkCtx?.llmInput && sessionIdForLlm
      ? { sessionId: sessionIdForLlm, ...thinkCtx.llmInput }
      : undefined,
  );

  const payload = await buildPayloadInternalFromMove(
    type,
    actionCode,
    frictionId,
    evaluation,
    move,
    sessionEvents,
    voiceDisabled,
    sessionCtx,
  );
  return { payload, move };
}

export async function buildPayload(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  sessionEvents?: SessionEvent[],
  voiceDisabled?: boolean,
  sessionCtx?: SessionContext,
  thinkCtx?: ThinkContext,
): Promise<Record<string, unknown>> {
  return buildPayloadInternal(
    type,
    actionCode,
    frictionId,
    evaluation,
    sessionEvents,
    voiceDisabled,
    sessionCtx,
    thinkCtx,
  );
}

async function buildPayloadInternal(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  sessionEvents?: SessionEvent[],
  voiceDisabled?: boolean,
  sessionCtx?: SessionContext,
  thinkCtx?: ThinkContext,
): Promise<Record<string, unknown>> {
  const move = decideMove({
    interventionType: type,
    actionCode,
    frictionId,
    frictionIds: [frictionId],
    tier: evaluation.tier,
    turnIndex: thinkCtx?.turnIndex ?? 0,
    liveObjections: thinkCtx?.liveObjections,
  });
  return buildPayloadInternalFromMove(
    type,
    actionCode,
    frictionId,
    evaluation,
    move,
    sessionEvents,
    voiceDisabled,
    sessionCtx,
  );
}

async function buildPayloadInternalFromMove(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  move: SalespersonMove,
  sessionEvents?: SessionEvent[],
  voiceDisabled?: boolean,
  sessionCtx?: SessionContext,
): Promise<Record<string, unknown>> {
  const template = getMessageTemplate(type, frictionId, sessionCtx);

  // Voice is enabled for nudge/active/escalate tiers only, when the move
  // carries a voice script, and the session budget has not been
  // exhausted/muted.
  const isVoiceTier = type === "nudge" || type === "active" || type === "escalate";

  // Thinking Layer step 2 → 9 (2026-05-19) — the SalespersonMove is
  // produced upstream (decideMove sync path or decideMoveAsync LLM path)
  // and passed in. The payload builder is purely format-layer here.
  const templateVoiceScript = move.voice_script ?? template.voiceScript;
  const voiceEnabled = isVoiceTier && !!templateVoiceScript && !voiceDisabled;

  // Keys use snake_case to match widget's InterventionPayload interface
  const base: Record<string, unknown> = {
    type,
    action_code: actionCode,
    friction_id: frictionId,
    message: template.message,
    tier: evaluation.tier,
    timestamp: new Date().toISOString(),
    voice_enabled: voiceEnabled,
    voice_script: voiceEnabled ? templateVoiceScript : undefined,
    // When a playbook applies (move carries sales_dialog), emit richer
    // bubble text and the step's objective for dashboard transparency.
    // Widget renders `sales_dialog || message` as the bubble content.
    ...(move.sales_dialog ? {
      sales_dialog: move.sales_dialog,
      playbook_objective: move.playbook_objective,
    } : {}),
  };

  switch (type) {
    case "passive":
      // Codex Phase 2.6 P2: passive stays SILENT — strip both audio AND the
      // proactive salesperson bubble. Visual ui_adjustment is still allowed
      // (subtle hint), but no curated dialog should pop up in passive mode.
      return {
        ...base,
        ui_adjustment: template.uiAdjustments?.[0] ?? null,
        silent: true,
        voice_enabled: false,
        voice_script: undefined,
        sales_dialog: undefined,
        playbook_objective: undefined,
      };

    case "nudge":
      return {
        ...base,
        cta_label: template.ctaLabel ?? "Learn more",
        cta_action: template.ctaAction ?? "open",
        dismissable: true,
        autoHideMs: 8000,
      };

    case "active": {
      const events = sessionEvents ?? [];
      const browsed = extractProductsFromEvents(events);
      const context = {
        events,
        cartValue: 0,
        frictionIds: evaluation.frictionIds,
      };
      const alternatives = findAlternatives(frictionId, context);
      const complementary =
        alternatives.length > 0
          ? findComplementary(alternatives[0].id, { events })
          : ([] as ProductSuggestion[]);
      const products = [...alternatives, ...complementary].slice(0, 4);
      const comparison = buildComparison(products, browsed);

      return {
        ...base,
        showPanel: true,
        products,
        comparison,
      };
    }

    case "escalate": {
      const events = sessionEvents ?? [];
      const browsed = extractProductsFromEvents(events);
      const context = {
        events,
        cartValue: 0,
        frictionIds: evaluation.frictionIds,
      };
      const alternatives = findAlternatives(frictionId, context);
      const complementary =
        alternatives.length > 0
          ? findComplementary(alternatives[0].id, { events })
          : ([] as ProductSuggestion[]);
      const products = [...alternatives, ...complementary].slice(0, 4);
      const comparison = buildComparison(products, browsed);

      // Offer a discount based on value signal: high value = 10%, very high = 15%
      const discountPct =
        evaluation.signals.value >= 80
          ? 15
          : evaluation.signals.value >= 60
          ? 10
          : 0;

      return {
        ...base,
        showPanel: true,
        urgent: true,
        products,
        comparison,
        offerDiscount: evaluation.tier === "ESCALATE",
        discountPct: discountPct > 0 ? discountPct : undefined,
      };
    }

    default:
      return base;
  }
}
