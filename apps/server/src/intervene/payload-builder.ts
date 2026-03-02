import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { getMessageTemplate } from "./message-templates.js";

/**
 * Build the intervention payload to send to the widget.
 */
export function buildPayload(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult
): Record<string, unknown> {
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

    case "active":
      return {
        ...base,
        showPanel: true,
        products: [],
        comparison: null,
      };

    case "escalate":
      return {
        ...base,
        showPanel: true,
        urgent: true,
        products: [],
        comparison: null,
        offerDiscount: evaluation.tier === "ESCALATE",
      };

    default:
      return base;
  }
}
