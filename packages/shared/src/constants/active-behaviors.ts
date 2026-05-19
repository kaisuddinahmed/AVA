// ============================================================================
// Active Behavior Allowlist — Thinking Layer step 8 (2026-05-19).
//
// The catalog at packages/shared/src/constants/behavior-pattern-catalog.ts
// holds 614 shopper behavior patterns (B001–B614). The 2026-05-19 audit
// found that only ~28% are detectable from current widget instrumentation,
// and a smaller subset actually drives a salesperson move. The remaining
// 70%+ are roadmap items the catalog tracks but the runtime should not
// report as "live detections."
//
// This module defines the curated ~40 patterns that the runtime treats as
// "active." Two consumers:
//
//   1. behavior-pattern-matcher.ts — tags each DetectedBehaviorPattern
//      with a `status: "active" | "roadmap"` so downstream code can
//      filter without changing detection.
//
//   2. Dashboard / reporting — by default surfaces only active patterns
//      so the surface area reflects what the salesperson can actually
//      act on.
//
// Growing the list is intentional and easy: when a new playbook gains a
// B-code dependency, add the B-code here. When new instrumentation lands
// (Thinking Layer step 5+), add the B-codes it makes detectable.
// ============================================================================

/**
 * The B-codes the runtime treats as "active." Curated by playbook
 * dependency and observability. Each line is annotated with why it's
 * here so the list stays principled.
 */
export const ACTIVE_BEHAVIOR_IDS: ReadonlySet<string> = new Set<string>([
  // --- Arrival / entry --------------------------------------------------
  "B002", // organic — informs intent score baseline
  "B005", // email-campaign click — high pre-existing engagement
  "B015", // first-time visitor — gates greet playbook (F335)
  "B016", // returning visitor — gates F332 returning playbook
  "B018", // mobile arrival — biases mobile-friction playbooks
  "B019", // desktop arrival — informs layout-adjacent moves

  // --- Browsing / navigation -------------------------------------------
  "B025", // homepage browsing only — F335 landing-greet pre-condition
  "B026", // category browsing — discovery group
  "B028", // browsing via site search — F028/F030 search playbooks
  "B040", // PDP arrival — universal pre-condition for product playbooks

  // --- Search ----------------------------------------------------------
  "B076", // keyword search — drives F028/F030 paths
  "B080", // misspelled query — drives F028 alternative suggestions
  "B084", // search abandonment — F002/F028 recovery

  // --- Product / PDP ---------------------------------------------------
  "B094", // PDP dwell — drives F042 / F058 / F117 timing
  "B107", // variant change (multi) — F326 variant-indecision (NEW)
  "B116", // review filter clicks — F327 review-research (NEW)
  "B121", // photo zoom / scroll — element re-read signal (F117)
  "B400", // size-guide open — F328 fit-anxiety (NEW)
  "B401", // out-of-stock variant click — F333 OOS (NEW)

  // --- Cart ------------------------------------------------------------
  "B135", // add-to-cart — gates F068 / F069 absence-detection
  "B143", // add-remove-readd — hesitation
  "B154", // coupon attempt — F099 promo-hunt

  // --- Checkout --------------------------------------------------------
  "B165", // checkout enter — pre-condition for F089 / F091 / F094
  "B170", // shipping step entry — F329 (NEW)
  "B175", // shipping step exit — F329 abandon
  "B180", // payment step entry — F330 (NEW)
  "B185", // payment step exit — F330 abandon
  "B202", // multi-step checkout progress — funnel-position signal

  // --- Pricing ---------------------------------------------------------
  "B283", // sticker-shock exit — F117 sticker-shock
  "B284", // price-comparison signal — F060 / F331 (NEW)
  "B290", // BOGO / promo response — F099

  // --- Decision --------------------------------------------------------
  "B301", // comparing items — F301 / F042 step 2
  "B304", // indecision loop — F326 / F301
  "B305", // multi-item viewing without choice — F334 (NEW)
  "B331", // tab-switch suspected compete — F331 (NEW)

  // --- Re-engagement ---------------------------------------------------
  "B402", // returning visitor decision aid — F332 (NEW)
  "B411", // cart recovery candidate — F068

  // --- Exit / abandonment ---------------------------------------------
  "B500", // exit intent — F002 / F068 trigger
  "B501", // quick bounce — F002 trigger
]);

/** O(1) check whether a B-code is in the active subset. */
export function isActiveBehavior(behaviorId: string): boolean {
  return ACTIVE_BEHAVIOR_IDS.has(behaviorId);
}

/** Status enum returned by the matcher for downstream filtering. */
export type BehaviorStatus = "active" | "roadmap";

/** Map a B-code to its runtime status. */
export function behaviorStatus(behaviorId: string): BehaviorStatus {
  return ACTIVE_BEHAVIOR_IDS.has(behaviorId) ? "active" : "roadmap";
}
