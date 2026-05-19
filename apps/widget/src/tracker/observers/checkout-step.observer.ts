import type { FISMBridge } from "../ws-transport.js";

/**
 * Checkout-Step Observer.
 *
 * Detects transitions between shipping/payment steps and emits exit
 * events when the visitor leaves a step within a threshold window.
 *
 * Fires:
 *   - F329 — shipping_step_abandon (exit within 90s of entering shipping)
 *   - F330 — payment_step_abandon  (exit within 120s of entering payment)
 *
 * Step detection is heuristic — Shopify's checkout uses URL paths like
 * `/checkout/<token>/shipping` and `/checkout/<token>/payment`; other
 * platforms use querystring or DOM step labels. Site overrides via
 * `window.__AVA_CHECKOUT_STEP_DETECTOR__` (function returning the
 * current step).
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
type CheckoutStep = "info" | "shipping" | "payment" | "review" | null;

export class CheckoutStepObserver {
  private bridge: FISMBridge;
  private currentStep: CheckoutStep = null;
  private stepEnteredAt: number | null = null;
  private pollHandle: number | null = null;
  private beforeUnloadHandler: (() => void) | null = null;

  private static readonly POLL_INTERVAL_MS = 1000;
  private static readonly SHIPPING_THRESHOLD_MS = 90000;
  private static readonly PAYMENT_THRESHOLD_MS = 120000;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.tick();
    this.pollHandle = window.setInterval(
      () => this.tick(),
      CheckoutStepObserver.POLL_INTERVAL_MS,
    );

    // Capture unload-from-step as an exit even if no transition fires.
    this.beforeUnloadHandler = () => this.maybeFireExit("unload");
    window.addEventListener("beforeunload", this.beforeUnloadHandler);
  }

  stop(): void {
    if (this.pollHandle != null) window.clearInterval(this.pollHandle);
    this.pollHandle = null;
    if (this.beforeUnloadHandler)
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
    this.beforeUnloadHandler = null;
  }

  private tick(): void {
    const next = this.detectStep();
    if (next === this.currentStep) return;

    // Transition — fire exit from the previous step, enter event for next.
    this.maybeFireExit("transition", next);
    this.currentStep = next;
    this.stepEnteredAt = next ? Date.now() : null;

    if (next) {
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "checkout",
        event_type: `checkout_step_entered_${next}`,
        raw_signals: { step: next },
        timestamp: Date.now(),
      });
    }
  }

  private maybeFireExit(
    reason: "transition" | "unload",
    nextStep?: CheckoutStep,
  ): void {
    if (!this.currentStep || !this.stepEnteredAt) return;

    const dwell = Date.now() - this.stepEnteredAt;
    let friction_id: string | null = null;

    if (
      this.currentStep === "shipping" &&
      dwell <= CheckoutStepObserver.SHIPPING_THRESHOLD_MS &&
      (nextStep == null || nextStep === null) // null = left checkout entirely
    ) {
      friction_id = "F329";
    }
    if (
      this.currentStep === "payment" &&
      dwell <= CheckoutStepObserver.PAYMENT_THRESHOLD_MS &&
      (nextStep == null || nextStep === null)
    ) {
      friction_id = "F330";
    }

    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id,
      category: "checkout",
      event_type: `checkout_step_exited_${this.currentStep}`,
      raw_signals: { dwell_ms: dwell, reason, next_step: nextStep ?? null },
      timestamp: Date.now(),
    });
  }

  private detectStep(): CheckoutStep {
    const override = (
      window as unknown as {
        __AVA_CHECKOUT_STEP_DETECTOR__?: () => CheckoutStep;
      }
    ).__AVA_CHECKOUT_STEP_DETECTOR__;
    if (typeof override === "function") {
      try {
        return override() ?? null;
      } catch {
        return null;
      }
    }

    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const url = `${path}${search}`;
    if (/\/checkout/.test(path) === false) return null;
    if (/\/(shipping|delivery)/.test(url)) return "shipping";
    if (/\/(payment)/.test(url)) return "payment";
    if (/\/(review|order-summary)/.test(url)) return "review";
    if (/\/(information|contact)/.test(url)) return "info";
    return "info"; // default checkout step bucket
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
