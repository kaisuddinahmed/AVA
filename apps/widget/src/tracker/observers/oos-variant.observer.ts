import type { FISMBridge } from "../ws-transport.js";

/**
 * OOS-Variant Observer.
 *
 * Fires F333 when the visitor clicks (or attempts to select) a variant
 * that is marked out of stock. Detection follows common patterns:
 *
 *   - `[data-variant-stock="0"]`
 *   - `.swatch.disabled`, `.swatch.sold-out`, `.variant-soldout`
 *   - `option[disabled]` containing "Sold out" / "Out of stock"
 *   - aria-disabled="true" on a variant control
 *
 * Sites can override matching via `window.__AVA_OOS_VARIANT_SELECTOR__`.
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class OosVariantObserver {
  private bridge: FISMBridge;
  private clickHandler: ((e: Event) => void) | null = null;
  private fired = false;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.clickHandler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || this.fired) return;
      if (!this.isOosVariantControl(t)) return;
      this.fired = true;
      const variantLabel =
        t.getAttribute("data-variant-label") ??
        t.getAttribute("aria-label") ??
        t.textContent?.trim() ??
        null;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F333",
        category: "product",
        event_type: "oos_variant_click",
        raw_signals: { variant: variantLabel },
        timestamp: Date.now(),
      });
    };
    document.addEventListener("click", this.clickHandler, true);
  }

  stop(): void {
    if (this.clickHandler)
      document.removeEventListener("click", this.clickHandler, true);
    this.clickHandler = null;
    this.fired = false;
  }

  private isOosVariantControl(el: HTMLElement): boolean {
    const override = (
      window as unknown as { __AVA_OOS_VARIANT_SELECTOR__?: string }
    ).__AVA_OOS_VARIANT_SELECTOR__;
    if (override) {
      try {
        if (el.matches?.(override) || el.closest?.(override)) return true;
      } catch {
        // fall through
      }
    }
    if (el.matches?.('[data-variant-stock="0"]')) return true;
    if (el.closest?.('[data-variant-stock="0"]')) return true;
    if (el.getAttribute?.("aria-disabled") === "true") {
      // Only count when it's clearly a variant control
      const parent = el.closest?.(".swatch, .variant, .product-options, [data-variant]");
      if (parent) return true;
    }
    if (
      el.matches?.(".swatch.disabled, .swatch.sold-out, .variant-soldout")
    ) {
      return true;
    }
    const text = (el.textContent ?? "").toLowerCase();
    if (
      /(out\s*of\s*stock|sold\s*out)/.test(text) &&
      el.closest?.(".swatch, .variant, .product-options, [data-variant]")
    ) {
      return true;
    }
    return false;
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
