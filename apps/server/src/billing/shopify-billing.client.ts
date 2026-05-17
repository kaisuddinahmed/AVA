// ============================================================================
// Shopify Billing GraphQL client — Phase 4.5.
//
// Thin fetch-based wrapper for the four billing operations we need.
// No SDK, no npm deps — matches the rest of AVA's Shopify Admin client
// pattern (Phase 1.3).
//
// Operations:
//   appSubscriptionCreate    — start a new subscription
//   appSubscriptionCancel    — cancel an existing subscription
//   appUsageRecordCreate     — charge a usage record (needs LINE-ITEM id,
//                              NOT subscription id — Codex must-have)
//   currentAppInstallation   — query active subscriptions for status sync
//
// Throws on `userErrors` from Shopify (silent failures are the worst kind
// of billing bug). HTTP errors surface with status code.
//
// Reference (verified 2026-05): https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate
// ============================================================================

import { logger } from "../logger.js";

const log = logger.child({ service: "shopify-billing-client" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShopifyBillingClientOptions {
  /** myshopify.com domain (e.g. "shop-name.myshopify.com"). */
  shopDomain: string;
  /** Admin API access token from OAuth (Phase 1.3). */
  accessToken: string;
  /** Override API version. Defaults to 2026-04. */
  apiVersion?: string;
  fetchImpl?: FetchLike;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export type ReplacementBehavior =
  | "APPLY_IMMEDIATELY"
  | "APPLY_ON_NEXT_BILLING_CYCLE"
  | "STANDARD";

export interface RecurringLineInput {
  amount: number;
  currencyCode: "USD";
  interval: "EVERY_30_DAYS" | "ANNUAL";
}

export interface UsageLineInput {
  terms: string;
  cappedAmount: number;
  currencyCode: "USD";
}

export interface CreateSubscriptionInput {
  name: string;
  returnUrl: string;
  trialDays?: number;
  /** Dev/CI safe charge — Shopify won't actually bill. */
  test?: boolean;
  replacementBehavior?: ReplacementBehavior;
  recurring?: RecurringLineInput;
  usage?: UsageLineInput;
}

export interface CreateSubscriptionResult {
  appSubscriptionId: string;
  confirmationUrl: string;
  /** When the subscription has a usage line item, its gid lives here.
   *  Persist this — `recordUsage()` won't work without it. */
  usageLineItemId: string | null;
  status: string;
}

export interface ActiveSubscription {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number;
  currentPeriodEnd: string | null;
  lineItems: Array<{ id: string; isUsage: boolean }>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createShopifyBillingClient(opts: ShopifyBillingClientOptions) {
  if (!opts.shopDomain) throw new Error("Shopify billing client: shopDomain required");
  if (!opts.accessToken) throw new Error("Shopify billing client: accessToken required");
  const apiVersion = opts.apiVersion ?? "2026-04";
  const endpoint = `https://${opts.shopDomain}/admin/api/${apiVersion}/graphql.json`;
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));

  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": opts.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Shopify billing HTTP ${res.status}: ${detail}`.trim());
    }
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors && body.errors.length > 0) {
      throw new Error(`Shopify billing GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`);
    }
    if (!body.data) throw new Error("Shopify billing: empty data envelope");
    return body.data;
  }

  // ── appSubscriptionCreate ────────────────────────────────────────────

  async function createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const lineItems: Array<Record<string, unknown>> = [];
    if (input.recurring) {
      lineItems.push({
        plan: {
          appRecurringPricingDetails: {
            price: { amount: input.recurring.amount, currencyCode: input.recurring.currencyCode },
            interval: input.recurring.interval,
          },
        },
      });
    }
    if (input.usage) {
      lineItems.push({
        plan: {
          appUsagePricingDetails: {
            terms: input.usage.terms,
            cappedAmount: { amount: input.usage.cappedAmount, currencyCode: input.usage.currencyCode },
          },
        },
      });
    }
    if (lineItems.length === 0) {
      throw new Error("createSubscription: at least one line item (recurring or usage) is required");
    }

    const query = `
      mutation AppSubscriptionCreate(
        $name: String!,
        $returnUrl: URL!,
        $trialDays: Int,
        $test: Boolean,
        $replacementBehavior: AppSubscriptionReplacementBehavior,
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name,
          returnUrl: $returnUrl,
          trialDays: $trialDays,
          test: $test,
          replacementBehavior: $replacementBehavior,
          lineItems: $lineItems
        ) {
          confirmationUrl
          appSubscription {
            id
            status
            lineItems { id plan { pricingDetails { __typename } } }
          }
          userErrors { field message }
        }
      }
    `;
    interface Resp {
      appSubscriptionCreate: {
        confirmationUrl: string | null;
        appSubscription: {
          id: string;
          status: string;
          lineItems: Array<{ id: string; plan: { pricingDetails: { __typename: string } } }>;
        } | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }
    const data = await gql<Resp>(query, {
      name: input.name,
      returnUrl: input.returnUrl,
      trialDays: input.trialDays ?? 0,
      test: input.test ?? false,
      replacementBehavior: input.replacementBehavior ?? "STANDARD",
      lineItems,
    });
    const result = data.appSubscriptionCreate;
    if (result.userErrors.length > 0) {
      throw new Error(
        `Shopify appSubscriptionCreate userErrors: ${result.userErrors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!result.appSubscription || !result.confirmationUrl) {
      throw new Error("Shopify appSubscriptionCreate: empty appSubscription/confirmationUrl");
    }
    const usageLineItem = result.appSubscription.lineItems.find(
      (li) => li.plan.pricingDetails.__typename === "AppUsagePricing",
    );
    log.info(
      { shopDomain: opts.shopDomain, subscriptionId: result.appSubscription.id, hasUsageLine: !!usageLineItem },
      "[shopify-billing] subscription created",
    );
    return {
      appSubscriptionId: result.appSubscription.id,
      confirmationUrl: result.confirmationUrl,
      usageLineItemId: usageLineItem?.id ?? null,
      status: result.appSubscription.status,
    };
  }

  // ── appSubscriptionCancel ────────────────────────────────────────────

  async function cancelSubscription(subscriptionId: string): Promise<{ status: string }> {
    const query = `
      mutation AppSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription { id status }
          userErrors { field message }
        }
      }
    `;
    interface Resp {
      appSubscriptionCancel: {
        appSubscription: { id: string; status: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }
    const data = await gql<Resp>(query, { id: subscriptionId });
    const result = data.appSubscriptionCancel;
    if (result.userErrors.length > 0) {
      throw new Error(`Shopify appSubscriptionCancel userErrors: ${result.userErrors.map((e) => e.message).join("; ")}`);
    }
    if (!result.appSubscription) throw new Error("Shopify appSubscriptionCancel: empty result");
    return { status: result.appSubscription.status };
  }

  // ── appUsageRecordCreate ─────────────────────────────────────────────

  async function recordUsage(input: {
    /** Codex-mandated: this MUST be the AppUsagePricing line-item ID, not subscriptionId. */
    subscriptionLineItemId: string;
    amount: number;
    currencyCode: "USD";
    description: string;
    /** Codex must-have: idempotency key prevents double-billing on retries. */
    idempotencyKey: string;
  }): Promise<{ usageRecordId: string }> {
    const query = `
      mutation AppUsageRecordCreate(
        $subscriptionLineItemId: ID!,
        $price: MoneyInput!,
        $description: String!,
        $idempotencyKey: String!
      ) {
        appUsageRecordCreate(
          subscriptionLineItemId: $subscriptionLineItemId,
          price: $price,
          description: $description,
          idempotencyKey: $idempotencyKey
        ) {
          appUsageRecord { id }
          userErrors { field message }
        }
      }
    `;
    interface Resp {
      appUsageRecordCreate: {
        appUsageRecord: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }
    const data = await gql<Resp>(query, {
      subscriptionLineItemId: input.subscriptionLineItemId,
      price: { amount: input.amount, currencyCode: input.currencyCode },
      description: input.description,
      idempotencyKey: input.idempotencyKey,
    });
    const result = data.appUsageRecordCreate;
    if (result.userErrors.length > 0) {
      throw new Error(`Shopify appUsageRecordCreate userErrors: ${result.userErrors.map((e) => e.message).join("; ")}`);
    }
    if (!result.appUsageRecord) throw new Error("Shopify appUsageRecordCreate: empty result");
    return { usageRecordId: result.appUsageRecord.id };
  }

  // ── currentAppInstallation.activeSubscriptions ───────────────────────

  async function getActiveSubscriptions(): Promise<ActiveSubscription[]> {
    const query = `
      query CurrentInstallationSubs {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            trialDays
            currentPeriodEnd
            lineItems {
              id
              plan { pricingDetails { __typename } }
            }
          }
        }
      }
    `;
    interface Resp {
      currentAppInstallation: {
        activeSubscriptions: Array<{
          id: string; name: string; status: string; test: boolean;
          trialDays: number; currentPeriodEnd: string | null;
          lineItems: Array<{ id: string; plan: { pricingDetails: { __typename: string } } }>;
        }>;
      };
    }
    const data = await gql<Resp>(query, {});
    return data.currentAppInstallation.activeSubscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      test: s.test,
      trialDays: s.trialDays,
      currentPeriodEnd: s.currentPeriodEnd,
      lineItems: s.lineItems.map((li) => ({
        id: li.id,
        isUsage: li.plan.pricingDetails.__typename === "AppUsagePricing",
      })),
    }));
  }

  return { createSubscription, cancelSubscription, recordUsage, getActiveSubscriptions };
}

export type ShopifyBillingClient = ReturnType<typeof createShopifyBillingClient>;
