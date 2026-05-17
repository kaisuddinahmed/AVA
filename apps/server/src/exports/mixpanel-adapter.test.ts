// ============================================================================
// mixpanel-adapter — Phase 4.4 unit tests.
//
// Asserts (Codex-mandated):
//   - POST to api.mixpanel.com/track?verbose=1 with JSON array body
//   - Region routing: us/eu/in → correct host
//   - Verbose response `{ status: 0 }` THROWS even on HTTP 200 (P1)
//   - Verbose response `{ status: 1 }` passes through
//   - HTTP non-2xx surfaces with status code
//   - Console fallback when token unset
//   - Dispatcher: missing token + provider=mixpanel → throws
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendViaConsole,
  sendViaMixpanel,
  sendMixpanelPayload,
  type FetchLike,
  type MixpanelPayload,
} from "./mixpanel-adapter.js";

function jsonFetch(body: object, status = 200, ok = true): FetchLike {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as FetchLike;
}

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => { Object.assign(process.env, ORIGINAL_ENV); });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

const PAYLOAD: MixpanelPayload = {
  events: [
    { event: "page_view", properties: { token: "tok", distinct_id: "v1", time: 1, $insert_id: "i1" } },
  ],
};

// ── Console adapter ────────────────────────────────────────────────────────

describe("sendViaConsole", () => {
  it("never fetches; returns provider=console", async () => {
    const r = await sendViaConsole(PAYLOAD);
    expect(r.provider).toBe("console");
    expect(r.eventCount).toBe(1);
  });
});

// ── Mixpanel adapter — URL + body ──────────────────────────────────────────

describe("sendViaMixpanel — URL + body", () => {
  it("POSTs to api.mixpanel.com/track?verbose=1 with JSON-array body", async () => {
    const fetchImpl = jsonFetch({ status: 1 });
    await sendViaMixpanel(PAYLOAD, { fetchImpl });
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toBe("https://api.mixpanel.com/track?verbose=1");
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].event).toBe("page_view");
    expect(body[0].properties.token).toBe("tok");
  });

  it("routes EU region to api-eu.mixpanel.com", async () => {
    const fetchImpl = jsonFetch({ status: 1 });
    await sendViaMixpanel(PAYLOAD, { region: "eu", fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("https://api-eu.mixpanel.com/track");
  });

  it("routes India region to api-in.mixpanel.com", async () => {
    const fetchImpl = jsonFetch({ status: 1 });
    await sendViaMixpanel(PAYLOAD, { region: "in", fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("https://api-in.mixpanel.com/track");
  });

  it("omits ?verbose=1 when opts.verbose=false", async () => {
    const fetchImpl = jsonFetch({});
    await sendViaMixpanel(PAYLOAD, { verbose: false, fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toBe("https://api.mixpanel.com/track");
  });
});

// ── Verbose response handling (Codex P1) ───────────────────────────────────

describe("sendViaMixpanel — verbose response handling", () => {
  it("CRITICAL: throws when verbose returns { status: 0, error: ... } even on HTTP 200", async () => {
    const fetchImpl = jsonFetch({ status: 0, error: "invalid token" });
    await expect(sendViaMixpanel(PAYLOAD, { fetchImpl })).rejects.toThrow(/validation rejected.*invalid token/);
  });

  it("returns status=1 result on verbose success", async () => {
    const fetchImpl = jsonFetch({ status: 1 });
    const r = await sendViaMixpanel(PAYLOAD, { fetchImpl });
    expect(r.status).toBe(1);
    expect(r.provider).toBe("mixpanel");
  });

  it("does NOT inspect body when verbose=false (HTTP status is the only check)", async () => {
    const fetchImpl = jsonFetch({ status: 0, error: "would have failed in verbose" });
    const r = await sendViaMixpanel(PAYLOAD, { verbose: false, fetchImpl });
    // Verbose disabled → no body inspection → success based on HTTP 200.
    expect(r.provider).toBe("mixpanel");
  });
});

// ── HTTP errors ────────────────────────────────────────────────────────────

describe("sendViaMixpanel — HTTP errors", () => {
  it("surfaces non-2xx status with detail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      text: async () => "rate_limit",
      json: async () => ({}),
    }) as unknown as FetchLike;
    await expect(sendViaMixpanel(PAYLOAD, { fetchImpl })).rejects.toThrow(/429.*rate_limit/);
  });
});

// ── Dispatcher ─────────────────────────────────────────────────────────────

describe("sendMixpanelPayload dispatcher", () => {
  it("defaults to console when MIXPANEL_PROJECT_TOKEN unset", async () => {
    delete process.env.MIXPANEL_PROJECT_TOKEN;
    const r = await sendMixpanelPayload(PAYLOAD);
    expect(r.provider).toBe("console");
  });

  it("uses mixpanel when MIXPANEL_PROJECT_TOKEN set", async () => {
    process.env.MIXPANEL_PROJECT_TOKEN = "tok";
    const fetchImpl = jsonFetch({ status: 1 });
    const r = await sendMixpanelPayload(PAYLOAD, { fetchImpl });
    expect(r.provider).toBe("mixpanel");
  });

  it("opts.provider=mixpanel without token in env throws", async () => {
    delete process.env.MIXPANEL_PROJECT_TOKEN;
    await expect(sendMixpanelPayload(PAYLOAD, { provider: "mixpanel" })).rejects.toThrow(/MIXPANEL_PROJECT_TOKEN/);
  });

  it("opts.provider=console overrides env", async () => {
    process.env.MIXPANEL_PROJECT_TOKEN = "tok";
    const r = await sendMixpanelPayload(PAYLOAD, { provider: "console" });
    expect(r.provider).toBe("console");
  });

  it("respects MIXPANEL_REGION=eu", async () => {
    process.env.MIXPANEL_PROJECT_TOKEN = "tok";
    process.env.MIXPANEL_REGION = "eu";
    const fetchImpl = jsonFetch({ status: 1 });
    await sendMixpanelPayload(PAYLOAD, { fetchImpl });
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain("api-eu.mixpanel.com");
  });
});
