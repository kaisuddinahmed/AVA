import type { FISMBridge } from "../ws-transport.js";

/**
 * Returning-Visitor Observer.
 *
 * Sets and reads a first-party cookie (`ava_visitor_id`) to recognize
 * repeat visitors. On a recognized returning visit with no conversion,
 * emits F332 — the salesperson should welcome them back and offer to
 * resume the last viewed PDP (stored in the same cookie's payload).
 *
 * Cookie is anonymized (random ID, never PII). 365-day lifetime, SameSite=Lax.
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class ReturningVisitorObserver {
  private bridge: FISMBridge;
  private cookieName = "ava_visitor_id";
  private fired = false;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    const existing = this.readCookie();
    if (!existing) {
      this.writeCookie(this.newId(), null);
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "engagement",
        event_type: "first_time_visitor",
        raw_signals: {},
        timestamp: Date.now(),
      });
      return;
    }

    // Returning visitor — emit event with metadata so server can decide
    // whether to fire F332 based on conversion history (server holds
    // authoritative conversion data, not the cookie).
    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id: null,
      category: "engagement",
      event_type: "returning_visitor",
      raw_signals: {
        visitor_id: existing.id,
        last_pdp: existing.lastPdp ?? null,
        days_since_first_seen: existing.firstSeenDays ?? null,
      },
      timestamp: Date.now(),
    });

    // Heuristic client-side trigger for F332 — server can dedupe / override.
    if (!this.fired && existing.lastPdp) {
      this.fired = true;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F332",
        category: "re_engagement",
        event_type: "returning_visitor_no_buy",
        raw_signals: {
          visitor_id: existing.id,
          last_pdp: existing.lastPdp,
        },
        timestamp: Date.now(),
      });
    }

    // Refresh cookie with current PDP if we're on one.
    if (this.isPdp(window.location.pathname)) {
      this.writeCookie(existing.id, window.location.pathname);
    }
  }

  stop(): void {
    this.fired = false;
  }

  private readCookie(): { id: string; lastPdp?: string | null; firstSeenDays?: number } | null {
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${this.cookieName}=`));
    if (!match) return null;
    try {
      const raw = decodeURIComponent(match.slice(this.cookieName.length + 1));
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private writeCookie(id: string, lastPdp: string | null): void {
    const value = encodeURIComponent(JSON.stringify({ id, lastPdp, firstSeenDays: 0 }));
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${this.cookieName}=${value}; path=/; expires=${expires}; SameSite=Lax`;
  }

  private newId(): string {
    return `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }

  private isPdp(path: string): boolean {
    return /\/(products?|p|item)\//i.test(path);
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
