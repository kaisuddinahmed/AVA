import type { FISMBridge } from "../ws-transport.js";

/**
 * Element Re-read Observer.
 *
 * Counts the number of times key product elements (price, primary photo)
 * re-enter the viewport during the same PDP visit. A re-read is a strong
 * tell that the visitor is weighing the decision — humans on a retail
 * floor pick something up, put it down, and pick it back up before
 * deciding.
 *
 * Emits:
 *   - `element_reread` with `{ selector, view_count }` when an element
 *     re-enters the viewport for the 2nd time and beyond.
 *
 * Phase: Thinking Layer step 5 (2026-05-19). Wires the signal new
 * F326/F328/F117 playbooks use to detect indecision and price-reread.
 */
export class ElementRereadObserver {
  private bridge: FISMBridge;
  private observer: IntersectionObserver | null = null;
  private viewCounts: Map<Element, number> = new Map();
  private selectorMap: Map<Element, string> = new Map();

  // Targeted selectors. Sites can extend via window.__AVA_REREAD_SELECTORS__.
  private static readonly DEFAULT_SELECTORS = [
    '[data-ava-price]',
    '[data-product-price]',
    '.product-price',
    '.price',
    '[data-ava-photo]',
    '[data-product-image]',
    '.product-photo',
    '.product__media img',
  ];

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    if (typeof IntersectionObserver === "undefined") return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          const next = (this.viewCounts.get(el) ?? 0) + 1;
          this.viewCounts.set(el, next);

          if (next < 2) continue; // only emit on re-reads (2nd+ view)

          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: null,
            category: "product",
            event_type: "element_reread",
            raw_signals: {
              selector: this.selectorMap.get(el) ?? "unknown",
              view_count: next,
            },
            timestamp: Date.now(),
          });
        }
      },
      { threshold: 0.5 },
    );

    const selectors = this.resolveSelectors();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        this.selectorMap.set(el, sel);
        this.observer!.observe(el);
      });
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.viewCounts.clear();
    this.selectorMap.clear();
  }

  private resolveSelectors(): string[] {
    const overrides = (window as unknown as {
      __AVA_REREAD_SELECTORS__?: string[];
    }).__AVA_REREAD_SELECTORS__;
    return overrides && overrides.length > 0
      ? overrides
      : ElementRereadObserver.DEFAULT_SELECTORS;
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
