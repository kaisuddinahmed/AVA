import type { FISMBridge } from "../ws-transport.js";

/**
 * Size-Chart Observer.
 *
 * Fires F328 when the visitor opens the size chart and dwells on it for
 * 10s+ — fit anxiety signal.
 *
 * Looks for common size-chart triggers (links/buttons whose text contains
 * "size guide", "size chart", or that match `[data-ava-size-chart]`) and
 * tracks the time between open and close.
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class SizeChartObserver {
  private bridge: FISMBridge;
  private openHandler: ((e: Event) => void) | null = null;
  private closeHandler: ((e: Event) => void) | null = null;
  private observer: MutationObserver | null = null;
  private openedAt: number | null = null;
  private firedF328 = false;

  private static readonly DWELL_THRESHOLD_MS = 10000;

  // Heuristic: any link/button whose textContent matches /size\s+(chart|guide)/i.
  private static readonly TRIGGER_DATA_ATTR = "data-ava-size-chart";

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.openHandler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (!this.isSizeChartTrigger(t)) return;
      this.openedAt = Date.now();
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "product",
        event_type: "size_chart_opened",
        raw_signals: {},
        timestamp: Date.now(),
      });

      // Schedule a deferred F328 fire if it stays open past threshold.
      window.setTimeout(() => this.maybeFireF328(), SizeChartObserver.DWELL_THRESHOLD_MS + 200);
    };

    // Heuristic close: any subsequent click outside the size chart modal,
    // or escape key. Themes vary; this captures the common case.
    this.closeHandler = () => {
      if (!this.openedAt) return;
      const dwell = Date.now() - this.openedAt;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "product",
        event_type: "size_chart_closed",
        raw_signals: { dwell_ms: dwell },
        timestamp: Date.now(),
      });
      this.openedAt = null;
      // Threshold check on close too in case the timer fired early.
      if (dwell >= SizeChartObserver.DWELL_THRESHOLD_MS) {
        this.maybeFireF328();
      }
    };

    document.addEventListener("click", this.openHandler, true);
    document.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") this.closeHandler?.(e);
    });
  }

  stop(): void {
    if (this.openHandler)
      document.removeEventListener("click", this.openHandler, true);
    this.openHandler = null;
    this.closeHandler = null;
    this.observer?.disconnect();
    this.observer = null;
    this.openedAt = null;
    this.firedF328 = false;
  }

  private isSizeChartTrigger(el: HTMLElement): boolean {
    if (el.hasAttribute?.(SizeChartObserver.TRIGGER_DATA_ATTR)) return true;
    if (el.closest?.(`[${SizeChartObserver.TRIGGER_DATA_ATTR}]`)) return true;
    const text =
      (el.textContent ?? "").trim().toLowerCase() +
      " " +
      (el.getAttribute?.("aria-label") ?? "").toLowerCase();
    return /size\s+(chart|guide)/.test(text);
  }

  private maybeFireF328(): void {
    if (this.firedF328 || !this.openedAt) return;
    const dwell = Date.now() - this.openedAt;
    if (dwell < SizeChartObserver.DWELL_THRESHOLD_MS) return;
    this.firedF328 = true;
    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id: "F328",
      category: "product",
      event_type: "size_chart_dwell",
      raw_signals: { dwell_ms: dwell },
      timestamp: Date.now(),
    });
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
