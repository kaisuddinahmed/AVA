import type { FISMBridge } from "../tracker/ws-transport.js";
import type { InterventionPayload, UIAdjustment } from "../config.js";
import { PassiveExecutor } from "../tracker/passive-executor.js";

/**
 * Intervention Handler — Executes intervention commands received from server.
 * Handles passive DOM adjustments and tracks intervention outcomes.
 */
export class InterventionHandler {
  private bridge: FISMBridge;
  private executedPassives = new Set<string>();

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  /**
   * Handle passive interventions — silent DOM modifications on the host page.
   * These don't open the widget, they modify the page directly.
   */
  handlePassive(payload: InterventionPayload): void {
    // Deduplicate — don't apply same passive twice
    const key = `${payload.action_code}_${payload.ui_adjustment?.target_selector || "global"}`;
    if (this.executedPassives.has(key)) return;
    this.executedPassives.add(key);

    if (payload.ui_adjustment) {
      try {
        PassiveExecutor.execute(payload.ui_adjustment);
        this.reportOutcome(payload.intervention_id, "delivered");
      } catch (err) {
        console.error("[AVA:InterventionHandler] Passive execution failed:", err);
        this.reportOutcome(payload.intervention_id, "ignored");
      }
    }
  }

  /**
   * Execute a specific UI adjustment command.
   */
  executeAdjustment(adjustment: UIAdjustment): boolean {
    try {
      PassiveExecutor.execute(adjustment);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a passive intervention has already been applied.
   */
  wasExecuted(actionCode: string, targetSelector?: string): boolean {
    const key = `${actionCode}_${targetSelector || "global"}`;
    return this.executedPassives.has(key);
  }

  /**
   * Report intervention outcome back to the server.
   */
  private reportOutcome(interventionId: string, status: string): void {
    this.bridge.sendOutcome(interventionId, status);
  }

  /**
   * Reset state (e.g., on page navigation within SPA).
   */
  reset(): void {
    this.executedPassives.clear();
  }
}
