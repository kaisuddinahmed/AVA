// ============================================================================
// digest-email.service — Phase 3.7 unit tests.
//
// Mocks buildWeeklyDigest, renderDigestEmail, and sendEmail to assert:
//   - explicit recipient overrides env
//   - falls back to DIGEST_EMAIL_RECIPIENT env when no override
//   - throws when no recipient is resolved
//   - composes build → render → send in order with the right args
//   - passes provider / fetchImpl overrides through to the adapter
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const buildWeeklyDigest = vi.fn();
const renderDigestEmail = vi.fn();
const sendEmail = vi.fn();

vi.mock("./weekly-digest.service.js", () => ({
  buildWeeklyDigest: (...args: unknown[]) => buildWeeklyDigest(...args),
}));
vi.mock("./digest-email.renderer.js", () => ({
  renderDigestEmail: (...args: unknown[]) => renderDigestEmail(...args),
}));
vi.mock("./email-adapter.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

import { sendDigestEmail } from "./digest-email.service.js";

const FAKE_DIGEST = {
  siteUrl: "https://x",
  outcomes: { attributedRevenue: 500, decisions: { ship: 1 } },
  recommendations: { pendingNow: 0 },
};
const FAKE_RENDERED = { subject: "Subj", html: "<p>html</p>", text: "text" };
const FAKE_DELIVERY = { provider: "console", recipient: "to@x.com", subject: "Subj", messageId: "console_1" };

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  buildWeeklyDigest.mockReset().mockResolvedValue(FAKE_DIGEST);
  renderDigestEmail.mockReset().mockReturnValue(FAKE_RENDERED);
  sendEmail.mockReset().mockResolvedValue(FAKE_DELIVERY);
  Object.assign(process.env, ORIGINAL_ENV);
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("recipient resolution", () => {
  it("uses the explicit opts.recipient when provided", async () => {
    delete process.env.DIGEST_EMAIL_RECIPIENT;
    await sendDigestEmail("https://x", { recipient: "owner@shop.com" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: "owner@shop.com" });
  });

  it("falls back to DIGEST_EMAIL_RECIPIENT env when no override", async () => {
    process.env.DIGEST_EMAIL_RECIPIENT = "env@shop.com";
    await sendDigestEmail("https://x");
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: "env@shop.com" });
  });

  it("throws when neither override nor env is set", async () => {
    delete process.env.DIGEST_EMAIL_RECIPIENT;
    await expect(sendDigestEmail("https://x")).rejects.toThrow(/recipient/i);
    expect(buildWeeklyDigest).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("dispatch ordering", () => {
  it("calls build → render → send in order and returns all three", async () => {
    process.env.DIGEST_EMAIL_RECIPIENT = "to@x.com";
    const result = await sendDigestEmail("https://x", { windowDays: 7 });
    expect(buildWeeklyDigest).toHaveBeenCalledWith("https://x", expect.objectContaining({ windowDays: 7 }));
    expect(renderDigestEmail).toHaveBeenCalledWith(FAKE_DIGEST);
    expect(sendEmail).toHaveBeenCalledWith(
      { to: "to@x.com", subject: "Subj", html: "<p>html</p>", text: "text" },
      expect.any(Object),
    );
    expect(result.digest).toBe(FAKE_DIGEST);
    expect(result.rendered).toBe(FAKE_RENDERED);
    expect(result.delivery).toBe(FAKE_DELIVERY);
  });

  it("threads provider + fetchImpl overrides through to sendEmail", async () => {
    process.env.DIGEST_EMAIL_RECIPIENT = "to@x.com";
    const fetchImpl = vi.fn();
    await sendDigestEmail("https://x", { provider: "resend", fetchImpl: fetchImpl as never });
    const second = sendEmail.mock.calls[0]![1] as { provider?: string; fetchImpl?: unknown };
    expect(second.provider).toBe("resend");
    expect(second.fetchImpl).toBe(fetchImpl);
  });
});
