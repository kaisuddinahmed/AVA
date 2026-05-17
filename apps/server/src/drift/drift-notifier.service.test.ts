// ============================================================================
// drift-notifier.service — Phase 4.2 unit tests.
//
// Asserts the routing rules:
//   - warning  → email only (no PagerDuty page)
//   - critical → email + PagerDuty (pages oncall)
//   - no recipient configured → email skipped, doesn't throw
//   - adapter failures are swallowed; result reports which channel sent
//   - severity mapping: critical → "critical", warning → "warning"
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendEmail = vi.fn();
const sendPagerDutyEvent = vi.fn();

vi.mock("../insights/email-adapter.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
vi.mock("./pagerduty-adapter.js", () => ({
  sendPagerDutyEvent: (...args: unknown[]) => sendPagerDutyEvent(...args),
}));

import { notifyDriftAlert } from "./drift-notifier.service.js";

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ provider: "console", recipient: "x", subject: "s", messageId: "m" });
  sendPagerDutyEvent.mockReset().mockResolvedValue({ provider: "console", dedupKey: "a", messageId: "m" });
  Object.assign(process.env, ORIGINAL_ENV);
  process.env.DRIFT_EMAIL_RECIPIENT = "oncall@shop.com";
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL_ENV)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

function alert(over: Partial<Parameters<typeof notifyDriftAlert>[0]> = {}): Parameters<typeof notifyDriftAlert>[0] {
  return {
    id: "alert_1",
    siteUrl: "https://shop.example",
    alertType: "tier_agreement_drop",
    severity: "warning",
    windowType: "1h",
    metric: "tierAgreementRate",
    expected: 0.85,
    actual: 0.65,
    message: "Tier agreement dropped from 85% to 65%",
    ...over,
  };
}

// ── Routing ────────────────────────────────────────────────────────────────

describe("notifyDriftAlert — routing", () => {
  it("warning severity: sends email, SKIPS PagerDuty", async () => {
    const r = await notifyDriftAlert(alert({ severity: "warning" }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendPagerDutyEvent).not.toHaveBeenCalled();
    expect(r.email.sent).toBe(true);
    expect(r.pagerduty.sent).toBe(false);
    expect(r.pagerduty.skipped).toBe(true);
  });

  it("critical severity: sends email AND PagerDuty", async () => {
    const r = await notifyDriftAlert(alert({ severity: "critical" }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendPagerDutyEvent).toHaveBeenCalledTimes(1);
    expect(r.email.sent).toBe(true);
    expect(r.pagerduty.sent).toBe(true);
  });
});

// ── PagerDuty event shape ──────────────────────────────────────────────────

describe("notifyDriftAlert — PagerDuty event shape", () => {
  it("uses alert.id as dedupKey + maps severity + carries metadata", async () => {
    await notifyDriftAlert(alert({ severity: "critical" }));
    const event = sendPagerDutyEvent.mock.calls[0]![0] as {
      dedupKey: string; severity: string; source: string;
      customDetails: { alertType: string; metric: string; actual: number };
    };
    expect(event.dedupKey).toBe("alert_1");
    expect(event.severity).toBe("critical");
    expect(event.source).toBe("https://shop.example");
    expect(event.customDetails).toMatchObject({
      alertType: "tier_agreement_drop",
      metric: "tierAgreementRate",
      actual: 0.65,
    });
  });

  it("uses 'ava-global' as source when siteUrl is null", async () => {
    await notifyDriftAlert(alert({ severity: "critical", siteUrl: null }));
    const event = sendPagerDutyEvent.mock.calls[0]![0] as { source: string };
    expect(event.source).toBe("ava-global");
  });
});

// ── Recipient resolution ───────────────────────────────────────────────────

describe("notifyDriftAlert — recipient resolution", () => {
  it("falls back to DIGEST_EMAIL_RECIPIENT when DRIFT_EMAIL_RECIPIENT unset", async () => {
    delete process.env.DRIFT_EMAIL_RECIPIENT;
    process.env.DIGEST_EMAIL_RECIPIENT = "fallback@shop.com";
    await notifyDriftAlert(alert());
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: "fallback@shop.com" });
  });

  it("returns email.sent=false with an error message when no recipient configured (no throw)", async () => {
    delete process.env.DRIFT_EMAIL_RECIPIENT;
    delete process.env.DIGEST_EMAIL_RECIPIENT;
    const r = await notifyDriftAlert(alert());
    expect(sendEmail).not.toHaveBeenCalled();
    expect(r.email.sent).toBe(false);
    expect(r.email.error).toMatch(/recipient/i);
  });
});

// ── Failure swallowing ─────────────────────────────────────────────────────

describe("notifyDriftAlert — failure swallowing (must NEVER throw)", () => {
  it("email adapter throws → email.sent=false, no propagation", async () => {
    sendEmail.mockRejectedValue(new Error("smtp down"));
    const r = await notifyDriftAlert(alert());
    expect(r.email.sent).toBe(false);
    expect(r.email.error).toContain("smtp down");
  });

  it("pagerduty adapter throws → pagerduty.sent=false, no propagation", async () => {
    sendPagerDutyEvent.mockRejectedValue(new Error("PD unreachable"));
    const r = await notifyDriftAlert(alert({ severity: "critical" }));
    expect(r.pagerduty.sent).toBe(false);
    expect(r.pagerduty.error).toContain("PD unreachable");
    // Email should still have fired even though PD failed.
    expect(r.email.sent).toBe(true);
  });

  it("BOTH adapters throw → both error, still no propagation", async () => {
    sendEmail.mockRejectedValue(new Error("email down"));
    sendPagerDutyEvent.mockRejectedValue(new Error("pd down"));
    const r = await notifyDriftAlert(alert({ severity: "critical" }));
    expect(r.email.sent).toBe(false);
    expect(r.pagerduty.sent).toBe(false);
  });
});

// ── Email content ──────────────────────────────────────────────────────────

describe("notifyDriftAlert — email content", () => {
  it("subject includes severity + alertType + site", async () => {
    await notifyDriftAlert(alert({ severity: "critical" }));
    const subj = (sendEmail.mock.calls[0]![0] as { subject: string }).subject;
    expect(subj).toContain("critical");
    expect(subj).toContain("tier_agreement_drop");
    expect(subj).toContain("https://shop.example");
  });

  it("html escapes the user-provided message + alert ID", async () => {
    await notifyDriftAlert(alert({ message: "<script>bad</script>", id: "id<>" }));
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).toContain("id&lt;&gt;");
  });
});
