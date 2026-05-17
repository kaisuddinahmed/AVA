// ============================================================================
// email-adapter — Phase 3.7 unit tests.
//
// Asserts:
//   - console adapter never fetches; returns provider='console'
//   - resend adapter posts to api.resend.com with bearer auth + JSON body
//   - resend adapter throws on missing apiKey
//   - resend adapter surfaces HTTP errors
//   - dispatcher honours opts.provider override and EMAIL_PROVIDER env
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendViaConsole,
  sendViaResend,
  sendEmail,
  type FetchLike,
} from "./email-adapter.js";

function okFetch(body: object): FetchLike {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => body,
  }) as unknown as FetchLike;
}
function badFetch(status: number, body = "boom"): FetchLike {
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

const INPUT = { to: "owner@shop.com", subject: "hi", html: "<p>hi</p>", text: "hi" };

// ── Console adapter ────────────────────────────────────────────────────────

describe("sendViaConsole", () => {
  it("returns provider=console and a synthetic messageId without sending", async () => {
    const result = await sendViaConsole(INPUT);
    expect(result.provider).toBe("console");
    expect(result.recipient).toBe("owner@shop.com");
    expect(result.messageId).toMatch(/^console_/);
  });
});

// ── Resend adapter ─────────────────────────────────────────────────────────

describe("sendViaResend", () => {
  it("POSTs to api.resend.com with bearer auth + JSON body", async () => {
    const fetchImpl = okFetch({ id: "rs_123" });
    const result = await sendViaResend(INPUT, { apiKey: "key", from: "ava@shop.com", fetchImpl });
    const call = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toBe("https://api.resend.com/emails");
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      from: "ava@shop.com",
      to: ["owner@shop.com"],
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toMatchObject({ provider: "resend", recipient: "owner@shop.com", messageId: "rs_123" });
  });

  it("uses input.from when provided, overriding opts.from", async () => {
    const fetchImpl = okFetch({ id: "x" });
    await sendViaResend({ ...INPUT, from: "custom@shop.com" }, { apiKey: "k", from: "default@shop.com", fetchImpl });
    const init = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as { body: string };
    expect(JSON.parse(init.body).from).toBe("custom@shop.com");
  });

  it("throws when apiKey is missing", async () => {
    await expect(sendViaResend(INPUT, { apiKey: "", from: "ava@shop.com" })).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("throws when from is missing on both opts and input", async () => {
    await expect(sendViaResend(INPUT, { apiKey: "k", from: "" })).rejects.toThrow(/EMAIL_FROM/);
  });

  it("throws with status code on HTTP failure", async () => {
    await expect(
      sendViaResend(INPUT, { apiKey: "k", from: "ava@shop.com", fetchImpl: badFetch(422, "validation_error") }),
    ).rejects.toThrow(/422.*validation_error/);
  });
});

// ── Dispatcher ─────────────────────────────────────────────────────────────

describe("sendEmail dispatcher", () => {
  it("defaults to console when EMAIL_PROVIDER is unset", async () => {
    delete process.env.EMAIL_PROVIDER;
    const r = await sendEmail(INPUT);
    expect(r.provider).toBe("console");
  });

  it("uses resend when EMAIL_PROVIDER=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "k";
    process.env.EMAIL_FROM = "ava@shop.com";
    const fetchImpl = okFetch({ id: "rs_x" });
    const r = await sendEmail(INPUT, { fetchImpl });
    expect(r.provider).toBe("resend");
    expect(r.messageId).toBe("rs_x");
  });

  it("opts.provider overrides env", async () => {
    process.env.EMAIL_PROVIDER = "resend"; // would normally route to resend
    const r = await sendEmail(INPUT, { provider: "console" });
    expect(r.provider).toBe("console");
  });
});
