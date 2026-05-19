import type { FISMBridge } from "../ws-transport.js";

/**
 * Cross-Product Compare Observer.
 *
 * Detects competing-tab comparison shopping: visitor switches tabs 2+
 * times AND has viewed at least 2 distinct PDPs in the current session
 * AND total time-away exceeds 20s. Fires F331.
 *
 * State is held per session — the observer reads PDP-view events emitted
 * by other observers (or the collector) and increments its own counters
 * from visibilitychange listeners.
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class CrossProductCompareObserver {
  private bridge: FISMBridge;
  private hiddenAt: number | null = null;
  private tabSwitchCount = 0;
  private awayMsTotal = 0;
  private pdpUrls: Set<string> = new Set();
  private fired = false;
  private visibilityHandler: (() => void) | null = null;

  private static readonly MIN_TAB_SWITCHES = 2;
  private static readonly MIN_AWAY_MS = 20000;
  private static readonly MIN_PDPS = 2;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    // Snapshot initial PDP if we're on one.
    this.maybeRecordPdp();

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.tabSwitchCount++;
      } else if (this.hiddenAt) {
        this.awayMsTotal += Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        this.maybeRecordPdp(); // returning visitor may have navigated
        this.checkThreshold();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // Track PDP changes via popstate / pushState patching.
    window.addEventListener("popstate", () => this.maybeRecordPdp());
  }

  stop(): void {
    if (this.visibilityHandler)
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = null;
    this.tabSwitchCount = 0;
    this.awayMsTotal = 0;
    this.pdpUrls.clear();
    this.fired = false;
  }

  private maybeRecordPdp(): void {
    if (!CrossProductCompareObserver.isPdp(window.location.pathname)) return;
    this.pdpUrls.add(window.location.pathname);
  }

  private checkThreshold(): void {
    if (this.fired) return;
    if (
      this.tabSwitchCount >= CrossProductCompareObserver.MIN_TAB_SWITCHES &&
      this.awayMsTotal >= CrossProductCompareObserver.MIN_AWAY_MS &&
      this.pdpUrls.size >= CrossProductCompareObserver.MIN_PDPS
    ) {
      this.fired = true;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F331",
        category: "decision",
        event_type: "suspected_competing_compare",
        raw_signals: {
          tab_switch_count: this.tabSwitchCount,
          away_ms_total: this.awayMsTotal,
          distinct_pdps: this.pdpUrls.size,
        },
        timestamp: Date.now(),
      });
    }
  }

  private static isPdp(path: string): boolean {
    return /\/(products?|p|item)\//i.test(path);
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
