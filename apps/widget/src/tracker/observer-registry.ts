// ============================================================================
// observer-registry — boot point for the Thinking-Layer observers.
//
// History:
//   - P1.1 (Codex 2026-05-19): observer modules existed in
//     apps/widget/src/tracker/observers/ but were never instantiated; the
//     F326-F335 signals never reached AVA. The first fix wired every
//     observer file into the registry.
//   - Follow-up (Codex 2026-05-19): the first fix double-counted legacy
//     analytics because BehaviorCollector (collector.ts) already emits
//     navigation/click/cart/form/search/scroll/page_view via its own
//     listeners. Mounting the legacy observer classes on top inflated
//     sessions, funnels, MSWIM signals, and recommendation inputs.
//
// Resolution: this registry now carries ONLY the 9 Thinking-Layer
// additions — the ones that produce F326-F335 signals BehaviorCollector
// does not already cover. The legacy observer files remain on disk but
// are intentionally orphaned (status quo before the Thinking Layer
// landed). If we later want to migrate any legacy responsibility into
// the registry, we must FIRST disable the overlapping listener in
// BehaviorCollector — not start it alongside.
//
// Adding a new Thinking-Layer observer = one import + one push() below.
// Adding a legacy class = NO. Migrate the responsibility out of
// BehaviorCollector first.
// ============================================================================

import type { FISMBridge } from "./ws-transport.js";

// ----- Thinking Layer step 5 observers (2026-05-19) ------------------------
// These cover signals BehaviorCollector does NOT emit today:
//   F326 variant-indecision, F327 review-depth, F328 size-chart dwell,
//   F329/F330 checkout step abandons, F331 competing-tab compare,
//   F332 returning-visitor decision aid, F333 OOS variant exposure,
//   F335 landing-greet trigger, plus element re-read for F117.
import { CheckoutStepObserver } from "./observers/checkout-step.observer.js";
import { CrossProductCompareObserver } from "./observers/cross-product-compare.observer.js";
import { ElementRereadObserver } from "./observers/element-reread.observer.js";
import { LandingGreetObserver } from "./observers/landing-greet.observer.js";
import { OosVariantObserver } from "./observers/oos-variant.observer.js";
import { ReturningVisitorObserver } from "./observers/returning-visitor.observer.js";
import { ReviewDepthObserver } from "./observers/review-depth.observer.js";
import { SizeChartObserver } from "./observers/size-chart.observer.js";
import { VariantFrequencyObserver } from "./observers/variant-frequency.observer.js";

interface ObserverLike {
  start(): void;
  stop(): void;
}

/** Instantiation order — keep deterministic for test snapshots. */
type Ctor = new (bridge: FISMBridge) => ObserverLike;
const OBSERVER_CONSTRUCTORS: Ctor[] = [
  // Thinking Layer step 5 (2026-05-19). DO NOT add legacy observers here
  // — BehaviorCollector already emits the equivalent events.
  CheckoutStepObserver,
  CrossProductCompareObserver,
  ElementRereadObserver,
  LandingGreetObserver,
  OosVariantObserver,
  ReturningVisitorObserver,
  ReviewDepthObserver,
  SizeChartObserver,
  VariantFrequencyObserver,
];

/**
 * Legacy observer class names BehaviorCollector already covers. Asserted
 * NOT to be in the registry by the unit test. If a future change tries
 * to wire one of these here without first disabling the overlapping
 * BehaviorCollector listener, the test fails.
 */
export const LEGACY_OBSERVER_CLASS_NAMES: ReadonlyArray<string> = [
  "CartObserver",
  "ClickObserver",
  "CopyObserver",
  "FormObserver",
  "HoverObserver",
  "NavigationObserver",
  "PerformanceObserver",
  "ScrollObserver",
  "SearchObserver",
  "VisibilityObserver",
];

/** Class names currently in the registry — exposed for the duplicate-guard test. */
export const REGISTERED_OBSERVER_CLASS_NAMES: ReadonlyArray<string> =
  OBSERVER_CONSTRUCTORS.map((c) => c.name);

/** Count exposed for tests. */
export const REGISTERED_OBSERVER_COUNT = OBSERVER_CONSTRUCTORS.length;

/**
 * Start every observer in the registry. Defensive: any observer that
 * throws during start is logged and skipped — one broken module must not
 * silence the rest. Returns a teardown closure that stops everything.
 */
export function startAllObservers(bridge: FISMBridge): () => void {
  const live: ObserverLike[] = [];
  for (const Ctor of OBSERVER_CONSTRUCTORS) {
    try {
      const observer = new Ctor(bridge);
      observer.start();
      live.push(observer);
    } catch (err) {
      // Widget runs in user browsers — never crash on a third-party DOM quirk.
      // eslint-disable-next-line no-console
      console.warn("[AVA] observer failed to start:", Ctor.name, err);
    }
  }

  return function stopAll(): void {
    for (const o of live) {
      try {
        o.stop();
      } catch {
        // best-effort teardown
      }
    }
  };
}
