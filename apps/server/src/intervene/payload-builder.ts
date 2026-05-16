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
  pickPlaybookForFrictions,
  selectStep,
} from "../voice/sales-playbooks.js";

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
export async function buildPayload(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  sessionEvents?: SessionEvent[],
  voiceDisabled?: boolean,
  sessionCtx?: SessionContext
): Promise<Record<string, unknown>> {
  const template = getMessageTemplate(type, frictionId, sessionCtx);

  // Voice is enabled for nudge/active/escalate tiers only, when the template
  // has a voice script, and the session budget has not been exhausted/muted.
  const isVoiceTier = type === "nudge" || type === "active" || type === "escalate";

  // Phase 2.6 — F-code sales playbook layering. When the firing friction has
  // a registered playbook (Phase 2.3 catalog), use its curated voice_script
  // and sales_dialog in preference to the generic message template. The
  // playbook's voice_script is asserted ≤80 chars at module load, so this
  // never busts the TTS budget.
  //
  // First step of the playbook is used for the proactive path (this is the
  // first time the shopper hears AVA about this friction). Reactive voice
  // queries cycle through steps based on turnCount; see voice-responder.
  const playbook = pickPlaybookForFrictions([frictionId]);
  const playbookStep = playbook ? selectStep(playbook, 0) : null;

  const templateVoiceScript = playbookStep?.voice_script ?? template.voiceScript;
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
    // Phase 2.6 — when a playbook applies, emit richer bubble text and the
    // step's objective for dashboard transparency. Widget renders
    // `sales_dialog || message` as the bubble content.
    ...(playbookStep ? {
      sales_dialog: playbookStep.sales_dialog,
      playbook_objective: playbookStep.objective,
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
