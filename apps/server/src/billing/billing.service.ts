// ============================================================================
// Billing service — Phase 4.5.
//
// Orchestrates plan changes between AVA and Shopify. Codex billing review
// fixes baked in:
//
//   1. Free plan path does NOT call Shopify. Local-only state.
//   2. Persists the usage line-item ID (not subscription id) — required
//      for appUsageRecordCreate.
//   3. Idempotency key on every usage record so retries don't double-bill.
//   4. Replacement behavior is decided per upgrade/downgrade direction.
//   5. Full status enum surface: ACTIVE | PENDING | DECLINED | EXPIRED |
//      CANCELLED | FROZEN.
//   6. recordUsage() refuses when no usage line item is on file.
//
// Caller flow:
//   startSubscription(shopDomain, planId, returnUrl)
//     → if free: clears Shopify subscription state, returns { confirmationUrl: null }
//     → else:    Shopify appSubscriptionCreate → persist subscriptionId +
//                usageLineItemId → return confirmationUrl for merchant approval
//
//   syncSubscriptionStatus(shopDomain)
//     → query currentAppInstallation.activeSubscriptions → reconcile state
//
//   recordUsage(shopDomain, amount, description)
//     → requires shopifyUsageLineItemId; throws otherwise
//
//   cancelSubscription(shopDomain)
//     → Shopify appSubscriptionCancel → flips local state to CANCELLED
// ============================================================================

import { createHash } from "crypto";
import { SiteConfigRepo } from "@ava/db";
import {
  createShopifyBillingClient,
  type ShopifyBillingClient,
  type ReplacementBehavior,
  type FetchLike,
} from "./shopify-billing.client.js";
import { getPlan, comparePlans, isFreePlan, type BillingPlan } from "./billing-plans.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "billing.service" });

// Status enum surface kept in sync with what Shopify returns.
export type SubscriptionStatus = "ACTIVE" | "PENDING" | "DECLINED" | "EXPIRED" | "CANCELLED" | "FROZEN";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SiteConfigBillingState {
  id: string;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
  shopifyAppSubscriptionId: string | null;
  shopifyUsageLineItemId: string | null;
  shopifyAppPlan: string | null;
  shopifyAppSubscriptionStatus: string | null;
  shopifyAppSubscriptionExpiresAt: Date | null;
  shopifyAppSubscriptionTest: boolean | null;
}

async function loadSiteConfig(shopDomain: string): Promise<SiteConfigBillingState> {
  const config = (await SiteConfigRepo.getSiteConfigByShopifyShop(shopDomain)) as
    | SiteConfigBillingState
    | null;
  if (!config) throw new Error(`No SiteConfig for shopDomain=${shopDomain}`);
  return config;
}

function ensureClient(
  config: SiteConfigBillingState,
  factory: BillingClientFactory,
): ShopifyBillingClient {
  if (!config.shopifyShop || !config.shopifyAccessToken) {
    throw new Error(`Shopify not installed for shop=${config.shopifyShop ?? "unknown"}`);
  }
  return factory({ shopDomain: config.shopifyShop, accessToken: config.shopifyAccessToken });
}

// Allow tests to inject a fake client; production uses the real GraphQL client.
export type BillingClientFactory = (opts: { shopDomain: string; accessToken: string; fetchImpl?: FetchLike }) => ShopifyBillingClient;
const defaultFactory: BillingClientFactory = (opts) => createShopifyBillingClient(opts);

function isTestMode(): boolean {
  return process.env.SHOPIFY_BILLING_TEST === "true";
}

function pickReplacementBehavior(currentPlan: string | null, targetPlan: string): ReplacementBehavior {
  const direction = comparePlans(currentPlan, targetPlan);
  if (direction === "upgrade") return "APPLY_IMMEDIATELY";
  if (direction === "downgrade") return "APPLY_ON_NEXT_BILLING_CYCLE";
  return "STANDARD";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StartSubscriptionOptions {
  /** Override the billing-client factory (used by tests). */
  clientFactory?: BillingClientFactory;
}

export interface StartSubscriptionResult {
  plan: BillingPlan["id"];
  /** Null when starting the free plan — no Shopify approval needed. */
  confirmationUrl: string | null;
  /** Null on free plan; gid otherwise. */
  appSubscriptionId: string | null;
}

/**
 * Initiate a plan change. Free plan is local-only; paid plans request a
 * confirmation URL from Shopify which the merchant must visit + approve.
 */
export async function startSubscription(
  shopDomain: string,
  planId: string,
  returnUrl: string,
  opts: StartSubscriptionOptions = {},
): Promise<StartSubscriptionResult> {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);
  const config = await loadSiteConfig(shopDomain);

  // ── Codex must-have: free plan does NOT call Shopify ────────────────
  if (isFreePlan(plan)) {
    await SiteConfigRepo.updateSiteConfig(config.id, {
      shopifyAppPlan: "free",
      shopifyAppSubscriptionId: null,
      shopifyUsageLineItemId: null,
      shopifyAppSubscriptionStatus: null,
      shopifyAppSubscriptionExpiresAt: null,
      shopifyAppSubscriptionTest: null,
    });
    log.info({ shopDomain, plan: "free" }, "[billing] free plan — Shopify not called");
    return { plan: "free", confirmationUrl: null, appSubscriptionId: null };
  }

  // ── Paid plan: build Shopify input ──────────────────────────────────
  const client = ensureClient(config, opts.clientFactory ?? defaultFactory);
  const replacementBehavior = pickReplacementBehavior(config.shopifyAppPlan, plan.id);

  const result = await client.createSubscription({
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    test: isTestMode(),
    replacementBehavior,
    recurring: plan.recurring ? {
      amount: plan.recurring.amount,
      currencyCode: "USD",
      interval: plan.recurring.interval,
    } : undefined,
    usage: plan.usage ? {
      terms: plan.usage.terms,
      cappedAmount: plan.usage.cappedAmountUsd,
      currencyCode: "USD",
    } : undefined,
  });

  // Persist immediately; status is PENDING until merchant approves at confirmationUrl.
  await SiteConfigRepo.updateSiteConfig(config.id, {
    shopifyAppPlan: plan.id,
    shopifyAppSubscriptionId: result.appSubscriptionId,
    shopifyUsageLineItemId: result.usageLineItemId,
    shopifyAppSubscriptionStatus: result.status,
    shopifyAppSubscriptionTest: isTestMode(),
  });

  log.info(
    { shopDomain, plan: plan.id, replacementBehavior, status: result.status, hasUsageLine: !!result.usageLineItemId },
    "[billing] subscription requested — awaiting merchant approval",
  );
  return {
    plan: plan.id,
    confirmationUrl: result.confirmationUrl,
    appSubscriptionId: result.appSubscriptionId,
  };
}

/**
 * Re-read Shopify's view of active subscriptions and reconcile local state.
 * Called by the return-URL handler and by the periodic sync job.
 */
export async function syncSubscriptionStatus(
  shopDomain: string,
  opts: { clientFactory?: BillingClientFactory } = {},
) {
  const config = await loadSiteConfig(shopDomain);
  if (!config.shopifyShop || !config.shopifyAccessToken) {
    log.warn({ shopDomain }, "[billing] sync skipped — no Shopify token");
    return null;
  }
  const client = ensureClient(config, opts.clientFactory ?? defaultFactory);
  const subs = await client.getActiveSubscriptions();

  if (subs.length === 0) {
    // Shopify has no active subscription for us — could be DECLINED, EXPIRED,
    // or CANCELLED. Preserve the last-known status if it's a terminal state;
    // otherwise mark CANCELLED so the merchant sees something accurate.
    const terminalKeep: SubscriptionStatus[] = ["DECLINED", "EXPIRED", "CANCELLED"];
    const last = config.shopifyAppSubscriptionStatus as SubscriptionStatus | null;
    const nextStatus: SubscriptionStatus = last && terminalKeep.includes(last) ? last : "CANCELLED";
    await SiteConfigRepo.updateSiteConfig(config.id, {
      shopifyAppSubscriptionStatus: nextStatus,
      shopifyAppSubscriptionId: null,
      shopifyUsageLineItemId: null,
    });
    log.info({ shopDomain, status: nextStatus }, "[billing] sync — no active sub");
    return { status: nextStatus, subscriptionId: null, usageLineItemId: null };
  }

  // Take the first active sub — we only allow one per merchant.
  const sub = subs[0]!;
  const usageLine = sub.lineItems.find((li) => li.isUsage);
  await SiteConfigRepo.updateSiteConfig(config.id, {
    shopifyAppSubscriptionId: sub.id,
    shopifyUsageLineItemId: usageLine?.id ?? null,
    shopifyAppSubscriptionStatus: sub.status,
    shopifyAppSubscriptionExpiresAt: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    shopifyAppSubscriptionTest: sub.test,
  });
  log.info(
    { shopDomain, subscriptionId: sub.id, status: sub.status, hasUsageLine: !!usageLine },
    "[billing] sync — state reconciled",
  );
  return { status: sub.status, subscriptionId: sub.id, usageLineItemId: usageLine?.id ?? null };
}

/**
 * Cancel the current Shopify subscription. Idempotent: a missing/already-
 * cancelled subscription is a no-op that updates local state.
 */
export async function cancelSubscription(
  shopDomain: string,
  opts: { clientFactory?: BillingClientFactory } = {},
) {
  const config = await loadSiteConfig(shopDomain);
  if (!config.shopifyAppSubscriptionId) {
    await SiteConfigRepo.updateSiteConfig(config.id, {
      shopifyAppSubscriptionStatus: "CANCELLED",
      shopifyUsageLineItemId: null,
    });
    return { status: "CANCELLED" as const };
  }
  const client = ensureClient(config, opts.clientFactory ?? defaultFactory);
  const result = await client.cancelSubscription(config.shopifyAppSubscriptionId);
  await SiteConfigRepo.updateSiteConfig(config.id, {
    shopifyAppSubscriptionStatus: result.status,
    shopifyAppSubscriptionId: null,
    shopifyUsageLineItemId: null,
  });
  log.info({ shopDomain, status: result.status }, "[billing] subscription cancelled");
  return { status: result.status };
}

export interface RecordUsageInput {
  shopDomain: string;
  amountUsd: number;
  description: string;
  /** Stable per-event identifier for the idempotency key. Codex must-have. */
  eventType: string;
  /** Period bucket (e.g. ISO month "2026-05"). Forms part of the idempotency key. */
  period: string;
  /** Optional explicit override; default is SHA-256(siteUrl|eventType|period|amount). */
  idempotencyKey?: string;
  clientFactory?: BillingClientFactory;
}

/**
 * Record a usage charge. Refuses when no usage line item exists on file —
 * recurring-only plans can't accrue usage charges (Codex must-have).
 */
export async function recordUsage(input: RecordUsageInput) {
  const config = await loadSiteConfig(input.shopDomain);
  if (!config.shopifyUsageLineItemId) {
    throw new Error(
      `recordUsage refused: no usage line item on file for shop=${input.shopDomain} ` +
      `(plan=${config.shopifyAppPlan ?? "none"}). Subscribe to a plan with usage pricing first.`,
    );
  }
  if (config.shopifyAppSubscriptionStatus !== "ACTIVE") {
    throw new Error(
      `recordUsage refused: subscription is ${config.shopifyAppSubscriptionStatus ?? "missing"}, not ACTIVE`,
    );
  }

  const idempotencyKey = input.idempotencyKey ?? deriveIdempotencyKey({
    shopDomain: input.shopDomain,
    eventType: input.eventType,
    period: input.period,
    amount: input.amountUsd,
  });

  const client = ensureClient(config, input.clientFactory ?? defaultFactory);
  const result = await client.recordUsage({
    subscriptionLineItemId: config.shopifyUsageLineItemId,
    amount: input.amountUsd,
    currencyCode: "USD",
    description: input.description,
    idempotencyKey,
  });
  log.info(
    { shopDomain: input.shopDomain, usageRecordId: result.usageRecordId, amount: input.amountUsd, idempotencyKey },
    "[billing] usage record created",
  );
  return result;
}

export function deriveIdempotencyKey(input: {
  shopDomain: string; eventType: string; period: string; amount: number;
}): string {
  const raw = `${input.shopDomain}|${input.eventType}|${input.period}|${input.amount}`;
  return `ava_${createHash("sha256").update(raw).digest("hex").slice(0, 28)}`;
}
