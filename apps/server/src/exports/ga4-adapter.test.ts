// ============================================================================
// ga4-adapter — Phase 4.3 unit tests.
//
// Asserts (Codex-validated against the live GA4 Measurement Protocol docs):
//   - URL: https://www.google-analytics.com/mp/collect with measurement_id +
//     api_secret in query string
//   - EU region routes to region1.google-analytics.com
//   - GA4_DEBUG=true routes to /debug/mp/collect
//   - Body: { client_id, events: [...] }
//   - Missing measurement_id or api_secret → throws
//   - HTTP failure surfaces with status code
//   - Console fallback when env unset
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendViaConsole,
  sendViaGA4,
  sendGA4Payload,
  type FetchLike,
  type GA4Payload,
} from "./ga4-adapter.js";

function okFetch(body: object = {}): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    text: async () => "",
    json: async () => body,
  }) as unknown as FetchLike;
}
function badFetch(status: number, body = "bad_request"): FetchLike {
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

const PAYLOAD: GA4Payload = {
  clientId: "visitor_abc",
  events: [
    { name: "page_view", params: { session_id: "s1", page_location: "https://shop.example" } },
  ],
};

// ── Console adapter ────────────────────────────────────────────────────────

describe("sendViaConsole", () => {
  it("never fetches; returns provider=console with event count", async () => {
    const r = await sendViaConsole(PAYLOAD);
    expect(r.provider).toBe("console");
    expect(r.eventCount).toBe(1);
  });
});

// ── GA4 adapter URL + body ─────────────────────────────────────────────────

describe("sendViaGA4 — URL + body", () => {
  it("POSTs to www.google-analytics.com/mp/collect with measurement_id + api_secret in querystring", async () => {
    const fetchImpl = okFetch();
    await sendViaGA4(PAYLOAD, { measurementId: "G-ABC", apiSecret: "sec", fetchImpl });
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const url = call[0] as string;
    expect(url).toContain("https://www.google-analytics.com/mp/collect");
    expect(url).toContain("measurement_id=G-ABC");
    expect(url).toContain("api_secret=sec");
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe("visitor_abc");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe("page_view");
  });

  it("EU region routes to region1.google-analytics.com", async () => {
    const fetchImpl = okFetch();
    await sendViaGA4(PAYLOAD, { measurementId: "G-ABC", apiSecret: "sec", region: "eu", fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("https://region1.google-analytics.com/mp/collect");
  });

  it("debug=true routes to /debug/mp/collect and parses validationMessages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ validationMessages: [{ fieldPath: "events[0].name", description: "test ok" }] }),
    }) as unknown as FetchLike;
    const r = await sendViaGA4(PAYLOAD, { measurementId: "G-ABC", apiSecret: "sec", debug: true, fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("/debug/mp/collect");
    expect(r.validationMessages).toEqual([{ fieldPath: "events[0].name", description: "test ok" }]);
  });

  it("URL-encodes measurement_id + api_secret", async () => {
    const fetchImpl = okFetch();
    await sendViaGA4(PAYLOAD, { measurementId: "G-A&B", apiSecret: "s c", fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("measurement_id=G-A%26B");
    expect(url).toContain("api_secret=s%20c");
  });
});

// ── Errors ─────────────────────────────────────────────────────────────────

describe("sendViaGA4 — error paths", () => {
  it("throws when measurement_id missing", async () => {
    await expect(sendViaGA4(PAYLOAD, { measurementId: "", apiSecret: "s" })).rejects.toThrow(/GA4_MEASUREMENT_ID/);
  });
  it("throws when api_secret missing", async () => {
    await expect(sendViaGA4(PAYLOAD, { measurementId: "m", apiSecret: "" })).rejects.toThrow(/GA4_API_SECRET/);
  });
  it("throws with status code on HTTP failure", async () => {
    await expect(
      sendViaGA4(PAYLOAD, { measurementId: "m", apiSecret: "s", fetchImpl: badFetch(400, "invalid_payload") }),
    ).rejects.toThrow(/400.*invalid_payload/);
  });
});

// ── Dispatcher ─────────────────────────────────────────────────────────────

describe("sendGA4Payload dispatcher", () => {
  it("defaults to console when GA4 env unset", async () => {
    delete process.env.GA4_MEASUREMENT_ID;
    delete process.env.GA4_API_SECRET;
    const r = await sendGA4Payload(PAYLOAD);
    expect(r.provider).toBe("console");
  });

  it("uses ga4 when GA4_MEASUREMENT_ID + GA4_API_SECRET both set", async () => {
    process.env.GA4_MEASUREMENT_ID = "G-XYZ";
    process.env.GA4_API_SECRET = "xyz";
    const fetchImpl = okFetch();
    const r = await sendGA4Payload(PAYLOAD, { fetchImpl });
    expect(r.provider).toBe("ga4");
  });

  it("opts.provider overrides env", async () => {
    process.env.GA4_MEASUREMENT_ID = "G-XYZ";
    process.env.GA4_API_SECRET = "xyz";
    const r = await sendGA4Payload(PAYLOAD, { provider: "console" });
    expect(r.provider).toBe("console");
  });
});
