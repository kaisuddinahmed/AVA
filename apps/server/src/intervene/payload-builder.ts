import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { getMessageTemplate } from "./message-templates.js";
import {
  findAlternatives,
  findComplementary,
  buildComparison,
  type ProductSuggestion,
} from "./product-intelligence.js";

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
 */
export async function buildPayload(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult,
  sessionEvents?: SessionEvent[]
): Promise<Record<string, unknown>> {
  const template = getMessageTemplate(type, frictionId);

  // Keys use snake_case to match widget's InterventionPayload interface
  const base: Record<string, unknown> = {
    type,
    action_code: actionCode,
    friction_id: frictionId,
    message: template.message,
    tier: evaluation.tier,
    timestamp: new Date().toISOString(),
  };

  switch (type) {
    case "passive":
      return {
        ...base,
        ui_adjustment: template.uiAdjustments?.[0] ?? null,
        silent: true,
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
      const comparison = buildComparison(products);

      return {
        ...base,
        showPanel: true,
        products,
        comparison,
      };
    }

    case "escalate": {
      const events = sessionEvents ?? [];
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
      const comparison = buildComparison(products);

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
