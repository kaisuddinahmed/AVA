// ============================================================================
// billing.service — Phase 4.5 unit tests.
//
// Asserts Codex billing-review must-haves:
//   - Free plan does NOT call Shopify
//   - Paid plan persists subscription id AND usage line-item id
//   - Replacement behavior: APPLY_IMMEDIATELY on upgrade, APPLY_ON_NEXT_BILLING_CYCLE on downgrade
//   - syncSubscriptionStatus handles ACTIVE / PENDING / DECLINED / EXPIRED / CANCELLED / FROZEN
//   - syncSubscriptionStatus reconciles "Shopify says no subs" to CANCELLED
//   - recordUsage REFUSES when no usage line item on file
//   - recordUsage REFUSES when subscription not ACTIVE
//   - recordUsage uses the usage line-item ID (NOT subscription id) + idempotency key
//   - Idempotency key is deterministic (same input → same key)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSiteConfigByShopifyShop = vi.fn();
const updateSiteConfig = vi.fn();

vi.mock("@ava/db", () => ({
  SiteConfigRepo: {
    getSiteConfigByShopifyShop: (...args: unknown[]) => getSiteConfigByShopifyShop(...args),
    updateSiteConfig: (...args: unknown[]) => updateSiteConfig(...args),
  },
}));

import {
  startSubscription,
  syncSubscriptionStatus,
  cancelSubscription,
  recordUsage,
  deriveIdempotencyKey,
  type BillingClientFactory,
} from "./billing.service.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  getSiteConfigByShopifyShop.mockReset();
  updateSiteConfig.mockReset().mockResolvedValue({});
  Object.assign(process.env, ORIGINAL_ENV);
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

function configWith(over: Record<string, unknown> = {}) {
  return {
    id: "site_1",
    shopifyShop: "shop-x.myshopify.com",
    shopifyAccessToken: "shpat_test",
    shopifyAppSubscriptionId: null,
    shopifyUsageLineItemId: null,
    shopifyAppPlan: null,
    shopifyAppSubscriptionStatus: null,
    shopifyAppSubscriptionExpiresAt: null,
    shopifyAppSubscriptionTest: null,
    ...over,
  };
}

function mockFactory(client: Partial<ReturnType<BillingClientFactory>>): BillingClientFactory {
  return () => client as ReturnType<BillingClientFactory>;
}

// ── Free plan path ─────────────────────────────────────────────────────────

describe("startSubscription — free plan (Codex must-have)", () => {
  it("does NOT call Shopify when planId='free'", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppPlan: "starter" }));
    const createSubscription = vi.fn();
    const result = await startSubscription("shop-x.myshopify.com", "free", "https://ava.example/cb", {
      clientFactory: mockFactory({ createSubscription }),
    });
    expect(createSubscription).not.toHaveBeenCalled();
    expect(result).toEqual({ plan: "free", confirmationUrl: null, appSubscriptionId: null });
    // Local state cleared.
    const update = updateSiteConfig.mock.calls[0]![1] as Record<string, unknown>;
    expect(update.shopifyAppPlan).toBe("free");
    expect(update.shopifyAppSubscriptionId).toBeNull();
    expect(update.shopifyUsageLineItemId).toBeNull();
  });
});

// ── Paid plan path ─────────────────────────────────────────────────────────

describe("startSubscription — paid plans", () => {
  it("persists subscription id AND usage line-item id (Codex must-have)", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith());
    const createSubscription = vi.fn().mockResolvedValue({
      appSubscriptionId: "gid://sub/1",
      confirmationUrl: "https://x.shopify.com/charge",
      usageLineItemId: "gid://li/usage",
      status: "PENDING",
    });
    const r = await startSubscription("shop-x.myshopify.com", "starter", "https://ava.example/cb", {
      clientFactory: mockFactory({ createSubscription }),
    });
    expect(r.confirmationUrl).toBe("https://x.shopify.com/charge");
    expect(r.appSubscriptionId).toBe("gid://sub/1");
    const update = updateSiteConfig.mock.calls[0]![1] as Record<string, unknown>;
    expect(update.shopifyAppSubscriptionId).toBe("gid://sub/1");
    expect(update.shopifyUsageLineItemId).toBe("gid://li/usage");
    expect(update.shopifyAppSubscriptionStatus).toBe("PENDING");
  });

  it("forwards trialDays + line items from the plan registry", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith());
    const createSubscription = vi.fn().mockResolvedValue({
      appSubscriptionId: "gid://sub/1", confirmationUrl: "https://x", usageLineItemId: "gid://li", status: "PENDING",
    });
    await startSubscription("shop-x.myshopify.com", "starter", "https://x", {
      clientFactory: mockFactory({ createSubscription }),
    });
    const args = createSubscription.mock.calls[0]![0] as { trialDays: number; recurring: { amount: number }; usage: { cappedAmount: number } };
    expect(args.trialDays).toBe(14);
    expect(args.recurring.amount).toBe(29);
    expect(args.usage.cappedAmount).toBe(100);
  });

  it("uses APPLY_IMMEDIATELY when upgrading (free → starter)", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppPlan: "free" }));
    const createSubscription = vi.fn().mockResolvedValue({
      appSubscriptionId: "gid://sub/1", confirmationUrl: "https://x", usageLineItemId: null, status: "PENDING",
    });
    await startSubscription("shop-x.myshopify.com", "starter", "https://x", {
      clientFactory: mockFactory({ createSubscription }),
    });
    const args = createSubscription.mock.calls[0]![0] as { replacementBehavior: string };
    expect(args.replacementBehavior).toBe("APPLY_IMMEDIATELY");
  });

  it("uses APPLY_ON_NEXT_BILLING_CYCLE when downgrading (pro → starter)", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppPlan: "pro" }));
    const createSubscription = vi.fn().mockResolvedValue({
      appSubscriptionId: "gid://sub/1", confirmationUrl: "https://x", usageLineItemId: null, status: "PENDING",
    });
    await startSubscription("shop-x.myshopify.com", "starter", "https://x", {
      clientFactory: mockFactory({ createSubscription }),
    });
    const args = createSubscription.mock.calls[0]![0] as { replacementBehavior: string };
    expect(args.replacementBehavior).toBe("APPLY_ON_NEXT_BILLING_CYCLE");
  });

  it("forwards test=true when SHOPIFY_BILLING_TEST env is set", async () => {
    process.env.SHOPIFY_BILLING_TEST = "true";
    getSiteConfigByShopifyShop.mockResolvedValue(configWith());
    const createSubscription = vi.fn().mockResolvedValue({
      appSubscriptionId: "gid://sub/1", confirmationUrl: "https://x", usageLineItemId: null, status: "PENDING",
    });
    await startSubscription("shop-x.myshopify.com", "starter", "https://x", {
      clientFactory: mockFactory({ createSubscription }),
    });
    const args = createSubscription.mock.calls[0]![0] as { test: boolean };
    expect(args.test).toBe(true);
  });

  it("throws when no Shopify access token", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAccessToken: null }));
    await expect(
      startSubscription("shop-x.myshopify.com", "starter", "https://x", {
        clientFactory: mockFactory({ createSubscription: vi.fn() }),
      }),
    ).rejects.toThrow(/Shopify not installed/);
  });
});

// ── syncSubscriptionStatus ─────────────────────────────────────────────────

describe("syncSubscriptionStatus — full status enum (Codex must-have)", () => {
  it.each(["ACTIVE", "PENDING", "DECLINED", "EXPIRED", "CANCELLED", "FROZEN"])(
    "handles status=%s from Shopify and persists",
    async (status) => {
      getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppPlan: "starter" }));
      const getActiveSubscriptions = vi.fn().mockResolvedValue([{
        id: "gid://sub/1", name: "AVA Starter", status, test: false, trialDays: 0,
        currentPeriodEnd: "2026-06-01T00:00:00Z",
        lineItems: [{ id: "gid://li/u", isUsage: true }],
      }]);
      const r = await syncSubscriptionStatus("shop-x.myshopify.com", {
        clientFactory: mockFactory({ getActiveSubscriptions }),
      });
      expect(r?.status).toBe(status);
      expect(updateSiteConfig.mock.calls[0]![1]).toMatchObject({
        shopifyAppSubscriptionStatus: status,
        shopifyAppSubscriptionId: "gid://sub/1",
        shopifyUsageLineItemId: "gid://li/u",
      });
    },
  );

  it("reconciles 'Shopify returned no subs' to CANCELLED by default", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppPlan: "starter", shopifyAppSubscriptionStatus: "ACTIVE" }));
    const getActiveSubscriptions = vi.fn().mockResolvedValue([]);
    const r = await syncSubscriptionStatus("shop-x.myshopify.com", {
      clientFactory: mockFactory({ getActiveSubscriptions }),
    });
    expect(r?.status).toBe("CANCELLED");
    expect(updateSiteConfig.mock.calls[0]![1]).toMatchObject({
      shopifyAppSubscriptionStatus: "CANCELLED",
      shopifyAppSubscriptionId: null,
      shopifyUsageLineItemId: null,
    });
  });

  it("preserves terminal status when Shopify returns no subs (don't overwrite DECLINED with CANCELLED)", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppSubscriptionStatus: "DECLINED" }));
    const getActiveSubscriptions = vi.fn().mockResolvedValue([]);
    const r = await syncSubscriptionStatus("shop-x.myshopify.com", {
      clientFactory: mockFactory({ getActiveSubscriptions }),
    });
    expect(r?.status).toBe("DECLINED");
  });
});

// ── cancelSubscription ─────────────────────────────────────────────────────

describe("cancelSubscription", () => {
  it("is idempotent when there's no live subscription", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppSubscriptionId: null }));
    const cancelSubscriptionFn = vi.fn();
    const r = await cancelSubscription("shop-x.myshopify.com", {
      clientFactory: mockFactory({ cancelSubscription: cancelSubscriptionFn }),
    });
    expect(cancelSubscriptionFn).not.toHaveBeenCalled();
    expect(r.status).toBe("CANCELLED");
  });

  it("calls Shopify and clears local subscription state on success", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({ shopifyAppSubscriptionId: "gid://sub/1" }));
    const cancelSubscriptionFn = vi.fn().mockResolvedValue({ status: "CANCELLED" });
    const r = await cancelSubscription("shop-x.myshopify.com", {
      clientFactory: mockFactory({ cancelSubscription: cancelSubscriptionFn }),
    });
    expect(cancelSubscriptionFn).toHaveBeenCalledWith("gid://sub/1");
    expect(r.status).toBe("CANCELLED");
    expect(updateSiteConfig.mock.calls[0]![1]).toMatchObject({
      shopifyAppSubscriptionStatus: "CANCELLED",
      shopifyAppSubscriptionId: null,
      shopifyUsageLineItemId: null,
    });
  });
});

// ── recordUsage (Codex must-haves) ─────────────────────────────────────────

describe("recordUsage — Codex must-haves", () => {
  it("REFUSES when no usage line item on file", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({
      shopifyAppPlan: "starter",
      shopifyAppSubscriptionStatus: "ACTIVE",
      shopifyUsageLineItemId: null, // none recorded
    }));
    await expect(
      recordUsage({
        shopDomain: "shop-x.myshopify.com",
        amountUsd: 0.05, description: "5 over bundle", eventType: "intervention_fired", period: "2026-05",
      }),
    ).rejects.toThrow(/no usage line item/);
  });

  it("REFUSES when subscription is not ACTIVE", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({
      shopifyAppSubscriptionStatus: "PENDING",
      shopifyUsageLineItemId: "gid://li/u",
    }));
    await expect(
      recordUsage({
        shopDomain: "shop-x.myshopify.com",
        amountUsd: 0.05, description: "x", eventType: "intervention_fired", period: "2026-05",
      }),
    ).rejects.toThrow(/not ACTIVE/);
  });

  it("uses the USAGE LINE-ITEM ID (not subscription id) + idempotency key", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({
      shopifyAppSubscriptionId: "gid://sub/1",
      shopifyUsageLineItemId: "gid://li/usage",
      shopifyAppSubscriptionStatus: "ACTIVE",
    }));
    const recordUsageFn = vi.fn().mockResolvedValue({ usageRecordId: "gid://usage/1" });
    await recordUsage({
      shopDomain: "shop-x.myshopify.com",
      amountUsd: 0.05, description: "5 over bundle",
      eventType: "intervention_fired", period: "2026-05",
      clientFactory: mockFactory({ recordUsage: recordUsageFn }),
    });
    const args = recordUsageFn.mock.calls[0]![0] as { subscriptionLineItemId: string; idempotencyKey: string };
    // Critical: it's the LINE-ITEM id, NOT the subscription id.
    expect(args.subscriptionLineItemId).toBe("gid://li/usage");
    expect(args.subscriptionLineItemId).not.toBe("gid://sub/1");
    expect(args.idempotencyKey).toMatch(/^ava_[a-f0-9]+$/);
  });

  it("accepts explicit idempotencyKey override", async () => {
    getSiteConfigByShopifyShop.mockResolvedValue(configWith({
      shopifyUsageLineItemId: "gid://li", shopifyAppSubscriptionStatus: "ACTIVE",
    }));
    const recordUsageFn = vi.fn().mockResolvedValue({ usageRecordId: "x" });
    await recordUsage({
      shopDomain: "shop-x.myshopify.com",
      amountUsd: 0.01, description: "x",
      eventType: "x", period: "2026-05",
      idempotencyKey: "my-key",
      clientFactory: mockFactory({ recordUsage: recordUsageFn }),
    });
    const args = recordUsageFn.mock.calls[0]![0] as { idempotencyKey: string };
    expect(args.idempotencyKey).toBe("my-key");
  });
});

// ── Idempotency key derivation ─────────────────────────────────────────────

describe("deriveIdempotencyKey — Codex must-have stability", () => {
  it("produces the SAME key for identical input (dedup invariant)", () => {
    const input = { shopDomain: "shop-x", eventType: "intervention_fired", period: "2026-05", amount: 0.05 };
    const a = deriveIdempotencyKey(input);
    const b = deriveIdempotencyKey({ ...input });
    expect(a).toBe(b);
    expect(a).toMatch(/^ava_[a-f0-9]{28}$/);
  });

  it("changes when any input field changes", () => {
    const base = { shopDomain: "shop-x", eventType: "intervention_fired", period: "2026-05", amount: 0.05 };
    expect(deriveIdempotencyKey({ ...base, period: "2026-06" })).not.toBe(deriveIdempotencyKey(base));
    expect(deriveIdempotencyKey({ ...base, amount: 0.06 })).not.toBe(deriveIdempotencyKey(base));
  });
});
