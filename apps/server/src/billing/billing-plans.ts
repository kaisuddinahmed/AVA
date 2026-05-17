// ============================================================================
// AVA billing plans — Phase 4.5.
//
// Declarative plan registry. The billing service consumes this; Shopify
// GraphQL mutations are built from these values, NOT from per-call args.
// Per Codex billing review: free plan does NOT call Shopify (no-charge
// flows add friction for no value).
//
// Three tiers initially:
//   free    — local-only, no Shopify subscription created
//   starter — $29 / 30-day with 14-day trial + usage cap at $100/mo
//   pro     — $99 / 30-day with 14-day trial + usage cap at $500/mo
//
// Usage line item charges per intervention-fired beyond the bundle:
//   starter: $0.01 each
//   pro:     $0.005 each
// ============================================================================

export type BillingInterval = "EVERY_30_DAYS" | "ANNUAL";

export interface RecurringPricing {
  amount: number;       // USD
  interval: BillingInterval;
}

export interface UsagePricing {
  /** Human-readable description shown in the Shopify charge confirmation. */
  terms: string;
  /** Hard cap — Shopify rejects usage records once total reaches this. */
  cappedAmountUsd: number;
}

export interface BillingPlan {
  id: "free" | "starter" | "pro";
  name: string;
  description: string;
  /** Tier ordinal for upgrade/downgrade detection (free=0, pro=2). */
  tierLevel: number;
  /** Days of free trial before the first charge. 0 = none. */
  trialDays: number;
  /** Null for the free plan — service skips Shopify entirely. */
  recurring: RecurringPricing | null;
  /** Optional usage-based component. */
  usage?: UsagePricing;
}

const PLANS: Record<BillingPlan["id"], BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    description: "AVA basic — read-only insights, no automated interventions",
    tierLevel: 0,
    trialDays: 0,
    recurring: null,
  },
  starter: {
    id: "starter",
    name: "AVA Starter",
    description: "AVA Starter — interventions + voice + weekly digest",
    tierLevel: 1,
    trialDays: 14,
    recurring: { amount: 29, interval: "EVERY_30_DAYS" },
    usage: {
      terms: "$0.01 per intervention fired beyond the included bundle",
      cappedAmountUsd: 100,
    },
  },
  pro: {
    id: "pro",
    name: "AVA Pro",
    description: "AVA Pro — everything in Starter + drift detection + dedicated support",
    tierLevel: 2,
    trialDays: 14,
    recurring: { amount: 99, interval: "EVERY_30_DAYS" },
    usage: {
      terms: "$0.005 per intervention fired beyond the included bundle",
      cappedAmountUsd: 500,
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPlan(id: string): BillingPlan | null {
  return (PLANS as Record<string, BillingPlan>)[id] ?? null;
}

export function listPlans(): BillingPlan[] {
  return Object.values(PLANS);
}

export function isFreePlan(plan: BillingPlan): boolean {
  return plan.recurring === null;
}

/**
 * Compare two plans by tierLevel to decide replacement behavior.
 *   target > current → upgrade   (apply immediately)
 *   target < current → downgrade (apply on next billing cycle)
 *   equal            → noop (caller should short-circuit)
 */
export function comparePlans(currentId: string | null | undefined, targetId: string): "upgrade" | "downgrade" | "same" {
  const current = currentId ? getPlan(currentId) : null;
  const target = getPlan(targetId);
  if (!target) throw new Error(`Unknown plan: ${targetId}`);
  if (!current) return "upgrade"; // first subscription is always an "upgrade"
  if (target.tierLevel > current.tierLevel) return "upgrade";
  if (target.tierLevel < current.tierLevel) return "downgrade";
  return "same";
}
