// ============================================================================
// Drift notifier — Phase 4.2.
//
// Fans a freshly-created DriftAlert out to the configured notification
// channels. Routing rules:
//
//   severity=warning   → email only      (audit trail, low ops noise)
//   severity=critical  → email + PagerDuty (pages oncall)
//
// Hard invariant: a notification failure must NEVER throw or propagate.
// Drift alert creation is the system of record; notifications are a
// side-channel. Every adapter call is wrapped in try/catch and logged.
//
// Recipient resolution mirrors Phase 3.7 (DIGEST_EMAIL_RECIPIENT); the
// drift channel uses DRIFT_EMAIL_RECIPIENT (falls back to DIGEST_EMAIL_RECIPIENT
// if unset). PagerDuty uses PAGERDUTY_ROUTING_KEY (handled inside the adapter).
// ============================================================================

import { sendEmail } from "../insights/email-adapter.js";
import { sendPagerDutyEvent } from "./pagerduty-adapter.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "drift-notifier" });

// ---------------------------------------------------------------------------
// Public contract — matches the DriftAlert shape with the fields we need.
// ---------------------------------------------------------------------------

export interface DriftAlertNotification {
  id: string;
  siteUrl: string | null;
  alertType: string;
  severity: "warning" | "critical" | string;
  windowType: string;
  metric: string;
  expected: number;
  actual: number;
  message: string;
}

export interface NotifyResult {
  email: { sent: boolean; error?: string };
  pagerduty: { sent: boolean; skipped?: boolean; error?: string };
}

function resolveRecipient(): string | null {
  const r = (process.env.DRIFT_EMAIL_RECIPIENT ?? process.env.DIGEST_EMAIL_RECIPIENT ?? "").trim();
  return r || null;
}

function renderSubject(alert: DriftAlertNotification): string {
  const site = alert.siteUrl ?? "global";
  return `AVA drift ${alert.severity}: ${alert.alertType} on ${site}`;
}

function renderText(alert: DriftAlertNotification): string {
  return [
    `AVA drift alert`,
    ``,
    `Severity: ${alert.severity}`,
    `Type:     ${alert.alertType}`,
    `Site:     ${alert.siteUrl ?? "global"}`,
    `Window:   ${alert.windowType}`,
    `Metric:   ${alert.metric}`,
    `Expected: ${alert.expected}`,
    `Actual:   ${alert.actual}`,
    ``,
    alert.message,
    ``,
    `Alert ID: ${alert.id}`,
  ].join("\n");
}

function renderHtml(alert: DriftAlertNotification): string {
  const sevColor = alert.severity === "critical" ? "#e45757" : "#e6b800";
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#06141e;color:#e8eef2;padding:20px;">
    <div style="max-width:520px;margin:auto;background:#0a1f29;border:1px solid #1a3d4a;border-radius:6px;padding:24px;">
      <div style="font-size:12px;color:#8aa3b0;text-transform:uppercase;letter-spacing:0.08em;">AVA drift alert</div>
      <h2 style="margin:8px 0;font-size:18px;">
        <span style="color:${sevColor};text-transform:uppercase;">${escape(alert.severity)}</span>
        ${escape(alert.alertType)}
      </h2>
      <table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:14px;">
        ${row("Site", alert.siteUrl ?? "global")}
        ${row("Window", alert.windowType)}
        ${row("Metric", alert.metric)}
        ${row("Expected", String(alert.expected))}
        ${row("Actual", String(alert.actual))}
      </table>
      <p style="margin-top:16px;font-size:13px;color:#e8eef2;">${escape(alert.message)}</p>
      <div style="margin-top:18px;font-family:Menlo,monospace;font-size:10px;color:#5f7a89;">Alert ID: ${escape(alert.id)}</div>
    </div>
  </body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 0;color:#8aa3b0;width:90px;">${escape(label)}</td><td style="padding:4px 0;color:#e8eef2;font-family:Menlo,monospace;">${escape(value)}</td></tr>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function severityForPagerDuty(s: string): "info" | "warning" | "error" | "critical" {
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  if (s === "error") return "error";
  return "info";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Notify configured channels about a drift alert. Severity gates PagerDuty.
 * Errors are swallowed; the result lets callers log/persist what happened
 * if they care. Drift alert creation MUST continue regardless.
 */
export async function notifyDriftAlert(alert: DriftAlertNotification): Promise<NotifyResult> {
  const result: NotifyResult = {
    email: { sent: false },
    pagerduty: { sent: false, skipped: alert.severity !== "critical" },
  };

  // ── Email (all severities) ────────────────────────────────────────────
  const recipient = resolveRecipient();
  if (!recipient) {
    result.email.error = "no recipient configured (DRIFT_EMAIL_RECIPIENT / DIGEST_EMAIL_RECIPIENT)";
    log.warn({ alertId: alert.id }, "[drift-notifier] no email recipient — skipping email");
  } else {
    try {
      await sendEmail({
        to: recipient,
        subject: renderSubject(alert),
        html: renderHtml(alert),
        text: renderText(alert),
      });
      result.email.sent = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.email.error = msg;
      log.error({ alertId: alert.id, err: msg }, "[drift-notifier] email dispatch failed");
    }
  }

  // ── PagerDuty (critical only) ─────────────────────────────────────────
  if (alert.severity === "critical") {
    try {
      await sendPagerDutyEvent({
        dedupKey: alert.id,
        summary: `${alert.alertType}: ${alert.message}`,
        severity: severityForPagerDuty(alert.severity),
        source: alert.siteUrl ?? "ava-global",
        customDetails: {
          alertType: alert.alertType,
          windowType: alert.windowType,
          metric: alert.metric,
          expected: alert.expected,
          actual: alert.actual,
        },
      });
      result.pagerduty.sent = true;
      result.pagerduty.skipped = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.pagerduty.error = msg;
      log.error({ alertId: alert.id, err: msg }, "[drift-notifier] pagerduty dispatch failed");
    }
  }

  log.info(
    {
      alertId: alert.id,
      severity: alert.severity,
      emailSent: result.email.sent,
      pagerdutySent: result.pagerduty.sent,
      pagerdutySkipped: result.pagerduty.skipped,
    },
    "[drift-notifier] dispatched",
  );
  return result;
}
