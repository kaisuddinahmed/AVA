import type { FISMBridge } from "../ws-transport.js";

/**
 * Landing-Greet Observer.
 *
 * Fires F335 when a visitor lands on the site and dwells 8s+ without any
 * meaningful interaction (no scroll past initial fold, no click, no
 * pointer move beyond a small drift). That's the moment a human floor
 * salesperson would step forward and offer help.
 *
 * Phase: Thinking Layer step 5 (2026-05-19). Pairs with the F335 playbook
 * — "Hi, I'm Ava. Need a hand finding something?"
 */
export class LandingGreetObserver {
  private bridge: FISMBridge;
  private startTs = 0;
  private pointerMoves = 0;
  private clicks = 0;
  private scrollPct = 0;
  private timer: number | null = null;
  private fired = false;
  private pointerHandler: ((e: Event) => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private scrollHandler: (() => void) | null = null;

  private static readonly DWELL_MS = 8000;
  private static readonly INTERACTION_FREE_POINTER_MAX = 5;
  private static readonly INTERACTION_FREE_SCROLL_MAX_PCT = 10;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    if (!this.isLanding(window.location.pathname)) return;
    this.startTs = Date.now();

    this.pointerHandler = () => {
      this.pointerMoves++;
    };
    this.clickHandler = () => {
      this.clicks++;
    };
    this.scrollHandler = () => {
      const max = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      );
      const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      this.scrollPct = Math.max(this.scrollPct, pct);
    };

    document.addEventListener("pointermove", this.pointerHandler, { passive: true });
    document.addEventListener("click", this.clickHandler, true);
    window.addEventListener("scroll", this.scrollHandler, { passive: true });

    this.timer = window.setTimeout(
      () => this.evaluate(),
      LandingGreetObserver.DWELL_MS,
    );
  }

  stop(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.pointerHandler)
      document.removeEventListener("pointermove", this.pointerHandler);
    if (this.clickHandler)
      document.removeEventListener("click", this.clickHandler, true);
    if (this.scrollHandler)
      window.removeEventListener("scroll", this.scrollHandler);
    this.pointerHandler = null;
    this.clickHandler = null;
    this.scrollHandler = null;
    this.fired = false;
  }

  private evaluate(): void {
    if (this.fired) return;
    if (this.clicks > 0) return; // any click is real interaction — skip
    if (this.scrollPct > LandingGreetObserver.INTERACTION_FREE_SCROLL_MAX_PCT) return;
    if (this.pointerMoves > LandingGreetObserver.INTERACTION_FREE_POINTER_MAX) return;
    this.fired = true;
    const dwell = Date.now() - this.startTs;
    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id: "F335",
      category: "landing",
      event_type: "landing_greet_trigger",
      raw_signals: {
        dwell_ms: dwell,
        pointer_moves: this.pointerMoves,
        clicks: this.clicks,
        scroll_pct: this.scrollPct,
      },
      timestamp: Date.now(),
    });
  }

  private isLanding(path: string): boolean {
    // Home page or first-page entry. Excludes PDPs / cart / checkout.
    return (
      path === "/" ||
      path === "" ||
      /^\/(home|index|collections?\/?)/.test(path)
    );
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
