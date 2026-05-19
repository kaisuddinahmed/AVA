import type { FISMBridge } from "../ws-transport.js";

/**
 * Review-Depth Observer.
 *
 * Tracks visitor engagement with the reviews section on a PDP — total
 * dwell time + filter/rating-control interactions. Fires F327 when the
 * visitor crosses 30s of dwell or 2+ filter clicks.
 *
 * Emits:
 *   - `review_section_entered` / `review_section_exited`
 *   - `review_filter_click` with the filter value
 *   - `behavioral_event` with `friction_id: "F327"` when thresholds cross
 *
 * Phase: Thinking Layer step 5 (2026-05-19).
 */
export class ReviewDepthObserver {
  private bridge: FISMBridge;
  private observer: IntersectionObserver | null = null;
  private enteredAt: number | null = null;
  private dwellMs = 0;
  private filterClicks = 0;
  private firedF327 = false;
  private clickHandler: ((e: Event) => void) | null = null;

  private static readonly REVIEW_SELECTORS = [
    "#reviews",
    ".reviews",
    "[data-ava-reviews]",
    "[data-reviews-section]",
    ".product-reviews",
    ".yotpo-reviews-main-widget",
  ];

  private static readonly FILTER_SELECTORS = [
    ".review-filter",
    "[data-review-filter]",
    ".reviews-pagination",
    ".yotpo-filter-star-distribution",
  ];

  private static readonly DWELL_THRESHOLD_MS = 30000;
  private static readonly FILTER_THRESHOLD = 2;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    if (typeof IntersectionObserver === "undefined") return;

    const target =
      ReviewDepthObserver.REVIEW_SELECTORS.map((s) =>
        document.querySelector(s),
      ).find(Boolean) ?? null;
    if (!target) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.enteredAt = Date.now();
            this.bridge.send("behavioral_event", {
              event_id: this.uid(),
              friction_id: null,
              category: "product",
              event_type: "review_section_entered",
              raw_signals: {},
              timestamp: Date.now(),
            });
          } else if (this.enteredAt) {
            const dur = Date.now() - this.enteredAt;
            this.dwellMs += dur;
            this.enteredAt = null;
            this.bridge.send("behavioral_event", {
              event_id: this.uid(),
              friction_id: null,
              category: "product",
              event_type: "review_section_exited",
              raw_signals: { dwell_ms_this_visit: dur, total_dwell_ms: this.dwellMs },
              timestamp: Date.now(),
            });
            this.checkThreshold();
          }
        }
      },
      { threshold: 0.4 },
    );
    this.observer.observe(target);

    this.clickHandler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const matched = ReviewDepthObserver.FILTER_SELECTORS.some((sel) => {
        try {
          return t.closest?.(sel) != null;
        } catch {
          return false;
        }
      });
      if (!matched) return;
      this.filterClicks++;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "product",
        event_type: "review_filter_click",
        raw_signals: { filter_clicks: this.filterClicks },
        timestamp: Date.now(),
      });
      this.checkThreshold();
    };
    document.addEventListener("click", this.clickHandler, true);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.clickHandler)
      document.removeEventListener("click", this.clickHandler, true);
    this.clickHandler = null;
    this.enteredAt = null;
    this.dwellMs = 0;
    this.filterClicks = 0;
    this.firedF327 = false;
  }

  private checkThreshold(): void {
    if (this.firedF327) return;
    if (
      this.dwellMs >= ReviewDepthObserver.DWELL_THRESHOLD_MS ||
      this.filterClicks >= ReviewDepthObserver.FILTER_THRESHOLD
    ) {
      this.firedF327 = true;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F327",
        category: "product",
        event_type: "deep_review_research",
        raw_signals: {
          dwell_ms: this.dwellMs,
          filter_clicks: this.filterClicks,
        },
        timestamp: Date.now(),
      });
    }
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
