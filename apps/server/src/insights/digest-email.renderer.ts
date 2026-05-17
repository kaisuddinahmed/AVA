// ============================================================================
// Digest email renderer — Phase 3.7.
//
// Pure function: WeeklyDigest → { subject, html, text }. Email-safe HTML:
// inline styles only, table-based layout, no external assets, no JS.
//
// Reuses the Phase 3.6 digest shape directly — same data drives the dashboard
// preview panel and this email, so there's no risk of divergence.
// ============================================================================

import type { WeeklyDigest } from "./weekly-digest.service.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDigestEmail(digest: WeeklyDigest): RenderedEmail {
  const dateLabel = `${fmtDate(digest.period.start)} → ${fmtDate(digest.period.end)}`;
  const revenue = `$${digest.outcomes.attributedRevenue.toFixed(2)}`;
  const shipped = digest.outcomes.decisions.ship;
  const pending = digest.recommendations.pendingNow;

  const subject = `AVA weekly: ${revenue} attributed · ${shipped} shipped · ${pending} pending`;

  const wow = digest.traffic.wowDeltaPct;
  const wowLabel = wow === null ? "—" : `${wow >= 0 ? "+" : ""}${wow.toFixed(1)}%`;

  // ── HTML body ──────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#06141e;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#e8eef2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#06141e;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#0a1f29;border:1px solid #1a3d4a;border-radius:8px;padding:28px;">
      <tr><td>
        <div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8aa3b0;">
          AVA weekly digest · ${escape(digest.siteUrl)}
        </div>
        <div style="font-size:13px;color:#8aa3b0;margin-top:6px;">${escape(dateLabel)} (${digest.period.days}d)</div>

        <h1 style="margin:18px 0 4px;font-size:28px;color:#e8eef2;font-weight:600;">
          ${escape(revenue)} <span style="color:#35d3a1;font-size:14px;">attributed revenue</span>
        </h1>
        <div style="font-size:14px;color:#8aa3b0;">
          ${shipped} shipped win${shipped === 1 ? "" : "s"} · ${pending} recommendation${pending === 1 ? "" : "s"} awaiting your review
        </div>

        <hr style="border:none;border-top:1px solid #1a3d4a;margin:24px 0;"/>

        ${metricRow([
          { label: "Sessions", value: fmtInt(digest.traffic.sessions), sub: `vs ${fmtInt(digest.traffic.sessionsPrior)} prior` },
          { label: "WoW", value: wowLabel, sub: "vs prior 7d", color: wowColor(wow) },
          { label: "Pending review", value: String(pending), sub: pending > 0 ? "approve in dashboard" : "inbox zero", color: pending > 0 ? "#e6b800" : "#35d3a1" },
        ])}

        <h2 style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#8aa3b0;text-transform:uppercase;letter-spacing:0.05em;">Outcomes this week</h2>
        <div>
          ${pill("ship", digest.outcomes.decisions.ship)}
          ${pill("rollback", digest.outcomes.decisions.rollback)}
          ${pill("extend", digest.outcomes.decisions.extend)}
          ${pill("inconclusive", digest.outcomes.decisions.inconclusive)}
        </div>

        ${digest.topFrictions.length > 0 ? topFrictionsBlock(digest) : ""}

        <hr style="border:none;border-top:1px solid #1a3d4a;margin:24px 0;"/>
        <div style="font-size:11px;color:#5f7a89;">
          AVA — autonomous shopping-friction recovery. Reply to this email if anything looks off.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  // ── Plain-text fallback ────────────────────────────────────────────────
  const text = [
    `AVA weekly digest — ${digest.siteUrl}`,
    `${dateLabel} (${digest.period.days} days)`,
    ``,
    `Attributed revenue: ${revenue}`,
    `Sessions: ${digest.traffic.sessions} (prior ${digest.traffic.sessionsPrior}, WoW ${wowLabel})`,
    `Recommendations: ${digest.recommendations.approvedThisWeek} approved · ${digest.recommendations.rejectedThisWeek} rejected · ${pending} pending · ${digest.recommendations.activeNow} active`,
    `Outcomes: ${digest.outcomes.decisions.ship} ship · ${digest.outcomes.decisions.rollback} rollback · ${digest.outcomes.decisions.extend} extend · ${digest.outcomes.decisions.inconclusive} inconclusive`,
    ``,
    `Top frictions:`,
    ...digest.topFrictions.map(
      (f) => `  ${f.frictionId}  n=${f.total}  CR=${(f.conversionRate * 100).toFixed(1)}%  dismiss=${(f.dismissalRate * 100).toFixed(1)}%`,
    ),
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Helpers — kept inline so the renderer is one self-contained module.
// ---------------------------------------------------------------------------

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function wowColor(wow: number | null): string {
  if (wow === null) return "#8aa3b0";
  return wow >= 0 ? "#35d3a1" : "#e45757";
}

function metricRow(cells: Array<{ label: string; value: string; sub: string; color?: string }>): string {
  const cellHtml = cells
    .map((c) => `
        <td width="33%" valign="top" style="padding:0 8px;">
          <div style="font-size:10px;color:#8aa3b0;text-transform:uppercase;letter-spacing:0.05em;">${escape(c.label)}</div>
          <div style="font-size:20px;font-weight:600;color:${c.color ?? "#e8eef2"};margin-top:2px;">${escape(c.value)}</div>
          <div style="font-size:11px;color:#5f7a89;margin-top:2px;">${escape(c.sub)}</div>
        </td>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cellHtml}</tr></table>`;
}

function pill(decision: "ship" | "rollback" | "extend" | "inconclusive", count: number): string {
  const palette: Record<string, { fg: string; bg: string }> = {
    ship:         { fg: "#35d3a1", bg: "rgba(53,211,161,0.18)" },
    rollback:     { fg: "#e45757", bg: "rgba(228,87,87,0.18)" },
    extend:       { fg: "#59b8e6", bg: "rgba(89,184,230,0.18)" },
    inconclusive: { fg: "#8aa3b0", bg: "rgba(255,255,255,0.06)" },
  };
  const c = palette[decision]!;
  return `<span style="display:inline-block;font-family:Menlo,monospace;font-size:10px;font-weight:700;padding:4px 10px;margin-right:6px;border-radius:3px;background:${c.bg};color:${c.fg};text-transform:uppercase;letter-spacing:0.05em;">${count} ${decision}</span>`;
}

function topFrictionsBlock(digest: WeeklyDigest): string {
  const rows = digest.topFrictions
    .map((f) => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1a3d4a;font-family:Menlo,monospace;font-size:11px;color:#35d3a1;">${escape(f.frictionId)}</td>
          <td style="padding:6px 0;border-bottom:1px solid #1a3d4a;font-family:Menlo,monospace;font-size:11px;color:#e8eef2;text-align:right;">n=${f.total}</td>
          <td style="padding:6px 0;border-bottom:1px solid #1a3d4a;font-family:Menlo,monospace;font-size:11px;color:#35d3a1;text-align:right;">${(f.conversionRate * 100).toFixed(1)}% conv</td>
          <td style="padding:6px 0;border-bottom:1px solid #1a3d4a;font-family:Menlo,monospace;font-size:11px;color:#e6b800;text-align:right;">${(f.dismissalRate * 100).toFixed(1)}% dismiss</td>
        </tr>`)
    .join("");
  return `
        <h2 style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#8aa3b0;text-transform:uppercase;letter-spacing:0.05em;">Top frictions by firings</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}
