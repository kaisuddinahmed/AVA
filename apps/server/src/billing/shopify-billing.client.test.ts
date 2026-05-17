// ============================================================================
// shopify-billing.client — Phase 4.5 unit tests.
//
// Asserts:
//   - GraphQL endpoint URL includes shop + version
//   - X-Shopify-Access-Token header is set
//   - createSubscription builds correct line-item shape (recurring + usage)
//   - usageLineItemId is parsed from response (Codex must-have)
//   - throws on userErrors
//   - throws on top-level GraphQL errors
//   - throws on HTTP non-2xx
//   - recordUsage forwards subscriptionLineItemId + idempotencyKey
//   - getActiveSubscriptions parses lineItems isUsage flag
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { createShopifyBillingClient, type FetchLike } from "./shopify-billing.client.js";

function okFetch(data: object): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    text: async () => JSON.stringify({ data }),
    json: async () => ({ data }),
  }) as unknown as FetchLike;
}
function gqlErrorFetch(messages: string[]): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    text: async () => "",
    json: async () => ({ errors: messages.map((m) => ({ message: m })) }),
  }) as unknown as FetchLike;
}
function httpFailFetch(status: number, body = "shop closed"): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: false, status,
    text: async () => body,
    json: async () => ({}),
  }) as unknown as FetchLike;
}

const SHOP = "shop-x.myshopify.com";
const TOKEN = "shpat_abc";

// ── Endpoint + headers ─────────────────────────────────────────────────────

describe("createShopifyBillingClient — endpoint + headers", () => {
  it("POSTs to /admin/api/<version>/graphql.json with shop in host", async () => {
    const fetchImpl = okFetch({
      appSubscriptionCreate: {
        confirmationUrl: "https://x.shopify.com/charge",
        appSubscription: { id: "gid://app/sub/1", status: "PENDING", lineItems: [] },
        userErrors: [],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    await client.createSubscription({
      name: "Starter", returnUrl: "https://ava.example/cb",
      recurring: { amount: 29, currencyCode: "USD", interval: "EVERY_30_DAYS" },
    });
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toBe(`https://${SHOP}/admin/api/2026-04/graphql.json`);
    const init = call[1] as { method: string; headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers["X-Shopify-Access-Token"]).toBe(TOKEN);
  });
});

// ── createSubscription ─────────────────────────────────────────────────────

describe("createSubscription", () => {
  it("builds appRecurringPricingDetails + appUsagePricingDetails line items", async () => {
    const fetchImpl = okFetch({
      appSubscriptionCreate: {
        confirmationUrl: "https://x.shopify.com/charge",
        appSubscription: {
          id: "gid://sub/1", status: "PENDING",
          lineItems: [
            { id: "gid://li/recurring", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
            { id: "gid://li/usage", plan: { pricingDetails: { __typename: "AppUsagePricing" } } },
          ],
        },
        userErrors: [],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    const result = await client.createSubscription({
      name: "Starter",
      returnUrl: "https://ava.example/cb",
      trialDays: 14,
      test: true,
      replacementBehavior: "APPLY_IMMEDIATELY",
      recurring: { amount: 29, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      usage: { terms: "$0.01/intervention", cappedAmount: 100, currencyCode: "USD" },
    });
    // Codex must-have: usageLineItemId parsed from response.
    expect(result.usageLineItemId).toBe("gid://li/usage");
    expect(result.appSubscriptionId).toBe("gid://sub/1");
    expect(result.confirmationUrl).toBe("https://x.shopify.com/charge");

    const init = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.variables.trialDays).toBe(14);
    expect(body.variables.test).toBe(true);
    expect(body.variables.replacementBehavior).toBe("APPLY_IMMEDIATELY");
    expect(body.variables.lineItems).toHaveLength(2);
    expect(body.variables.lineItems[0].plan.appRecurringPricingDetails.price.amount).toBe(29);
    expect(body.variables.lineItems[1].plan.appUsagePricingDetails.cappedAmount.amount).toBe(100);
  });

  it("returns usageLineItemId=null when plan has no usage line", async () => {
    const fetchImpl = okFetch({
      appSubscriptionCreate: {
        confirmationUrl: "https://x.shopify.com/charge",
        appSubscription: {
          id: "gid://sub/1", status: "PENDING",
          lineItems: [{ id: "gid://li/recurring", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } }],
        },
        userErrors: [],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    const result = await client.createSubscription({
      name: "Recurring-only",
      returnUrl: "https://ava.example/cb",
      recurring: { amount: 29, currencyCode: "USD", interval: "EVERY_30_DAYS" },
    });
    expect(result.usageLineItemId).toBeNull();
  });

  it("throws when no line items supplied", async () => {
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl: okFetch({}) });
    await expect(
      client.createSubscription({ name: "x", returnUrl: "https://x" }),
    ).rejects.toThrow(/at least one line item/);
  });

  it("throws on userErrors (Codex must-have)", async () => {
    const fetchImpl = okFetch({
      appSubscriptionCreate: {
        confirmationUrl: null,
        appSubscription: null,
        userErrors: [{ field: ["price"], message: "amount must be positive" }],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    await expect(
      client.createSubscription({
        name: "bad", returnUrl: "https://x",
        recurring: { amount: -1, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      }),
    ).rejects.toThrow(/amount must be positive/);
  });

  it("throws on top-level GraphQL errors", async () => {
    const fetchImpl = gqlErrorFetch(["Throttled"]);
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    await expect(
      client.createSubscription({
        name: "x", returnUrl: "https://x",
        recurring: { amount: 29, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      }),
    ).rejects.toThrow(/Throttled/);
  });

  it("surfaces HTTP non-2xx with status code", async () => {
    const fetchImpl = httpFailFetch(401, "unauthorized");
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    await expect(
      client.createSubscription({
        name: "x", returnUrl: "https://x",
        recurring: { amount: 29, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      }),
    ).rejects.toThrow(/401.*unauthorized/);
  });
});

// ── recordUsage ────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("forwards subscriptionLineItemId + idempotencyKey to Shopify", async () => {
    const fetchImpl = okFetch({
      appUsageRecordCreate: {
        appUsageRecord: { id: "gid://usage/1" },
        userErrors: [],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    const r = await client.recordUsage({
      subscriptionLineItemId: "gid://li/usage",
      amount: 0.05,
      currencyCode: "USD",
      description: "5 interventions over bundle",
      idempotencyKey: "ava_abc123",
    });
    expect(r.usageRecordId).toBe("gid://usage/1");
    const body = JSON.parse(((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as { body: string }).body);
    expect(body.variables.subscriptionLineItemId).toBe("gid://li/usage");
    expect(body.variables.idempotencyKey).toBe("ava_abc123");
    expect(body.variables.price.amount).toBe(0.05);
  });

  it("throws on userErrors", async () => {
    const fetchImpl = okFetch({
      appUsageRecordCreate: {
        appUsageRecord: null,
        userErrors: [{ message: "Usage exceeds capped amount" }],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    await expect(
      client.recordUsage({
        subscriptionLineItemId: "gid://li/usage", amount: 9999, currencyCode: "USD",
        description: "spike", idempotencyKey: "k",
      }),
    ).rejects.toThrow(/exceeds capped amount/);
  });
});

// ── getActiveSubscriptions ─────────────────────────────────────────────────

describe("getActiveSubscriptions", () => {
  it("parses lineItems and flags AppUsagePricing items as usage", async () => {
    const fetchImpl = okFetch({
      currentAppInstallation: {
        activeSubscriptions: [{
          id: "gid://sub/1", name: "Pro", status: "ACTIVE", test: false,
          trialDays: 14, currentPeriodEnd: "2026-06-01T00:00:00Z",
          lineItems: [
            { id: "gid://li/r", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
            { id: "gid://li/u", plan: { pricingDetails: { __typename: "AppUsagePricing" } } },
          ],
        }],
      },
    });
    const client = createShopifyBillingClient({ shopDomain: SHOP, accessToken: TOKEN, fetchImpl });
    const subs = await client.getActiveSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("ACTIVE");
    expect(subs[0]!.lineItems[0]).toMatchObject({ id: "gid://li/r", isUsage: false });
    expect(subs[0]!.lineItems[1]).toMatchObject({ id: "gid://li/u", isUsage: true });
  });
});

// ── Construction guards ────────────────────────────────────────────────────

describe("createShopifyBillingClient — construction guards", () => {
  it("throws when shopDomain missing", () => {
    expect(() => createShopifyBillingClient({ shopDomain: "", accessToken: "t" })).toThrow(/shopDomain/);
  });
  it("throws when accessToken missing", () => {
    expect(() => createShopifyBillingClient({ shopDomain: "x.myshopify.com", accessToken: "" })).toThrow(/accessToken/);
  });
});
