import type { FISMBridge } from "../ws-transport.js";

/**
 * Variant Frequency Observer.
 *
 * Tracks how often the visitor changes the variant selection on a PDP.
 * Detects: F326 — variant indecision (3+ changes without ATC).
 *
 * Emits:
 *   - `variant_changed` on every change with a running count
 *   - `behavioral_event` with `friction_id: "F326"` when count crosses 3
 *
 * Listens to common variant selector patterns (data-variant, select.size,
 * .swatch button) plus the `variant:change` custom event Shopify themes
 * emit. Sites can override via `window.__AVA_VARIANT_SELECTORS__`.
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class VariantFrequencyObserver {
  private bridge: FISMBridge;
  private changeCount = 0;
  private lastValue: string | null = null;
  private firedF326 = false;
  private clickHandler: ((e: Event) => void) | null = null;
  private changeHandler: ((e: Event) => void) | null = null;
  private customHandler: ((e: Event) => void) | null = null;

  private static readonly DEFAULT_SELECTORS = [
    '[data-ava-variant]',
    '[data-variant]',
    'select[name="id"]',
    'select.product-variant',
    '.product-options select',
    '.swatch input',
    '.swatch button',
  ];

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    const handle = (selectorMatched: string, value: string | null) => {
      if (value === this.lastValue) return;
      this.lastValue = value;
      this.changeCount++;

      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "product",
        event_type: "variant_changed",
        raw_signals: {
          selector: selectorMatched,
          value,
          change_count: this.changeCount,
        },
        timestamp: Date.now(),
      });

      if (this.changeCount >= 3 && !this.firedF326) {
        this.firedF326 = true;
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F326",
          category: "product",
          event_type: "variant_indecision",
          raw_signals: { change_count: this.changeCount },
          timestamp: Date.now(),
        });
      }
    };

    this.changeHandler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const sel = VariantFrequencyObserver.matchSelector(target);
      if (!sel) return;
      const val =
        (target as HTMLInputElement | HTMLSelectElement).value ??
        target.getAttribute("data-variant-value") ??
        target.textContent?.trim() ??
        null;
      handle(sel, val);
    };

    this.clickHandler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const sel = VariantFrequencyObserver.matchSelector(target);
      if (!sel) return;
      const val =
        target.getAttribute("data-variant-value") ??
        target.getAttribute("aria-label") ??
        target.textContent?.trim() ??
        null;
      handle(sel, val);
    };

    this.customHandler = (e: Event) => {
      const ce = e as CustomEvent<{ value?: string }>;
      handle("variant:change-event", ce.detail?.value ?? null);
    };

    document.addEventListener("change", this.changeHandler, true);
    document.addEventListener("click", this.clickHandler, true);
    document.addEventListener("variant:change", this.customHandler as EventListener);
  }

  stop(): void {
    if (this.changeHandler)
      document.removeEventListener("change", this.changeHandler, true);
    if (this.clickHandler)
      document.removeEventListener("click", this.clickHandler, true);
    if (this.customHandler)
      document.removeEventListener("variant:change", this.customHandler as EventListener);
    this.changeCount = 0;
    this.lastValue = null;
    this.firedF326 = false;
  }

  private static matchSelector(el: Element): string | null {
    const overrides = (window as unknown as {
      __AVA_VARIANT_SELECTORS__?: string[];
    }).__AVA_VARIANT_SELECTORS__;
    const selectors = overrides && overrides.length > 0
      ? overrides
      : VariantFrequencyObserver.DEFAULT_SELECTORS;
    for (const sel of selectors) {
      try {
        if (el.matches?.(sel)) return sel;
      } catch {
        // ignore invalid selector
      }
    }
    return null;
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
