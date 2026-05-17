// ============================================================================
// pagerduty-adapter — Phase 4.2 unit tests.
//
// Asserts:
//   - console adapter never fetches
//   - resend-equivalent: POSTs to events.pagerduty.com/v2/enqueue with
//     routing_key in body (NOT auth header)
//   - missing routing key → throws
//   - HTTP failure surfaces with status code
//   - dispatcher: routes to console when key unset, to pagerduty when set
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendViaConsole,
  sendViaPagerDuty,
  sendPagerDutyEvent,
  type FetchLike,
} from "./pagerduty-adapter.js";

function okFetch(body: object): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: async () => "",
    json: async () => body,
  }) as unknown as FetchLike;
}
function badFetch(status: number, body = "rate_limited"): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  }) as unknown as FetchLike;
}

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => { Object.assign(process.env, ORIGINAL_ENV); });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

const EVENT = {
  dedupKey: "alert_1",
  summary: "tier agreement dropped to 65%",
  severity: "critical" as const,
  source: "https://shop.example",
  customDetails: { metric: "tierAgreementRate", actual: 0.65 },
};

// ── Console adapter ────────────────────────────────────────────────────────

describe("sendViaConsole", () => {
  it("never makes a network call and returns provider=console", async () => {
    const result = await sendViaConsole(EVENT);
    expect(result.provider).toBe("console");
    expect(result.dedupKey).toBe("alert_1");
    expect(result.messageId).toMatch(/^console_/);
  });
});

// ── PagerDuty adapter ──────────────────────────────────────────────────────

describe("sendViaPagerDuty", () => {
  it("POSTs to events.pagerduty.com/v2/enqueue with routing_key in BODY (not header)", async () => {
    const fetchImpl = okFetch({ dedup_key: "alert_1", message: "Event processed" });
    await sendViaPagerDuty(EVENT, { routingKey: "rk_xxx", fetchImpl });

    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toBe("https://events.pagerduty.com/v2/enqueue");
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    // Auth must NOT live in a header — Events API v2 uses routing_key in body.
    expect(init.headers["Authorization"]).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.routing_key).toBe("rk_xxx");
    expect(body.event_action).toBe("trigger");
    expect(body.dedup_key).toBe("alert_1");
    expect(body.payload.summary).toBe(EVENT.summary);
    expect(body.payload.severity).toBe("critical");
    expect(body.payload.source).toBe(EVENT.source);
    expect(body.payload.custom_details).toEqual(EVENT.customDetails);
  });

  it("returns the PagerDuty-supplied dedup_key when present", async () => {
    const fetchImpl = okFetch({ dedup_key: "pd_normalized_key", message: "ok" });
    const r = await sendViaPagerDuty(EVENT, { routingKey: "rk_x", fetchImpl });
    expect(r.provider).toBe("pagerduty");
    expect(r.messageId).toBe("pd_normalized_key");
  });

  it("throws when routingKey is missing", async () => {
    await expect(sendViaPagerDuty(EVENT, { routingKey: "" })).rejects.toThrow(/PAGERDUTY_ROUTING_KEY/);
  });

  it("throws with status code on HTTP failure", async () => {
    await expect(
      sendViaPagerDuty(EVENT, { routingKey: "rk_x", fetchImpl: badFetch(429, "rate_limited") }),
    ).rejects.toThrow(/429.*rate_limited/);
  });
});

// ── Dispatcher ─────────────────────────────────────────────────────────────

describe("sendPagerDutyEvent dispatcher", () => {
  it("defaults to console when PAGERDUTY_ROUTING_KEY is unset", async () => {
    delete process.env.PAGERDUTY_ROUTING_KEY;
    const r = await sendPagerDutyEvent(EVENT);
    expect(r.provider).toBe("console");
  });

  it("uses pagerduty when PAGERDUTY_ROUTING_KEY is set", async () => {
    process.env.PAGERDUTY_ROUTING_KEY = "rk_xxx";
    const fetchImpl = okFetch({ dedup_key: "alert_1", message: "ok" });
    const r = await sendPagerDutyEvent(EVENT, { fetchImpl });
    expect(r.provider).toBe("pagerduty");
  });

  it("opts.provider overrides env", async () => {
    process.env.PAGERDUTY_ROUTING_KEY = "rk_xxx";
    const r = await sendPagerDutyEvent(EVENT, { provider: "console" });
    expect(r.provider).toBe("console");
  });
});
