import { useMemo, useState, useCallback } from "react";
import type { InterventionData, OverviewAnalytics, SessionSummary, VoiceAnalytics, WebhookStatsResponse } from "../types";
import { useApi, apiFetch } from "../hooks/use-api";
import { fmtTime, fmtNum, fmtPct, fmtScore, tierColor } from "../lib/format";

interface Props {
  interventions: InterventionData[];
  selectedSession: string | null;
  overview: OverviewAnalytics | null;
  sessions: SessionSummary[];
  /** Pre-built query string (e.g. "?siteUrl=...&since=...") matching other analytics hooks */
  analyticsParams?: string;
  webhookStats: WebhookStatsResponse | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function outcomeColor(key: string): string {
  const map: Record<string, string> = {
    converted: "var(--accent)",
    delivered: "var(--info)",
    dismissed: "var(--warn)",
    ignored: "#8b7ea8",
    sent: "var(--muted)",
  };
  return map[key] ?? "var(--muted)";
}

function typeColor(type: string): string {
  const map: Record<string, string> = {
    passive: "var(--tier-passive)",
    nudge: "var(--tier-nudge)",
    active: "var(--tier-active)",
    escalate: "var(--tier-escalate)",
  };
  return map[type?.toLowerCase()] ?? "var(--muted)";
}

function statusIcon(status: string): string {
  switch (status) {
    case "converted": return "✓";
    case "dismissed": return "✕";
    case "ignored":   return "–";
    case "delivered": return "→";
    default:          return "·";
  }
}

function severityColor(s: string) {
  return s === "critical" ? "var(--tier-escalate)" : "var(--warn)";
}

function jobStatusColor(s: string) {
  return s === "completed" ? "var(--accent)" : s === "failed" ? "var(--tier-escalate)" : "var(--info)";
}

function rolloutStatusColor(s: string) {
  const m: Record<string, string> = {
    rolling: "var(--accent)",
    completed: "var(--tier-monitor)",
    rolled_back: "var(--tier-escalate)",
    paused: "var(--warn)",
    pending: "var(--muted)",
  };
  return m[s] ?? "var(--muted)";
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    padding: "3px 8px",
    background: color + "22",
    border: `1px solid ${color}55`,
    borderRadius: 3,
    color,
    cursor: "pointer",
  };
}

/** Collapsed section — hidden by default */
function SystemSection({ title, badge, children, defaultOpen = false }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(o => !o)}>
        <span>
          {title}
          {badge && (
            <span style={{ marginLeft: 8, fontSize: 9, background: "rgba(232,155,59,0.2)", color: "var(--accent)", borderRadius: 3, padding: "1px 5px" }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function InterventionsTab({ interventions, selectedSession, overview, sessions, analyticsParams = "", webhookStats }: Props) {
  const filtered = useMemo(
    () => selectedSession ? interventions.filter((i) => i.session_id === selectedSession) : interventions,
    [interventions, selectedSession]
  );

  const eff = overview?.interventionEfficiency;

  const outcomeCounts = useMemo(() => {
    const counts = { converted: 0, delivered: 0, dismissed: 0, ignored: 0, sent: 0 };
    for (const i of filtered) {
      const s = i.status ?? "sent";
      if (s in counts) counts[s as keyof typeof counts]++;
    }
    return counts;
  }, [filtered]);

  const totalOutcomes = (eff?.fired ?? 0) || Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  // ── Revenue recovery estimate ──────────────────────────────────────────
  // avg cart value from sessions × confirmed conversions
  const avgCartValue = useMemo(() => {
    if (!sessions.length) return 0;
    const withValue = sessions.filter((s) => s.cartValue > 0);
    if (!withValue.length) return 0;
    return withValue.reduce((sum, s) => sum + s.cartValue, 0) / withValue.length;
  }, [sessions]);

  const conversionsCount = eff?.converted ?? outcomeCounts.converted;
  const estimatedRevenue = conversionsCount > 0 && avgCartValue > 0
    ? conversionsCount * avgCartValue
    : null;

  const conversionRate = eff?.conversionRate
    ?? (totalOutcomes > 0 ? outcomeCounts.converted / totalOutcomes : 0);
  const dismissalRate = eff?.dismissalRate
    ?? (totalOutcomes > 0 ? outcomeCounts.dismissed / totalOutcomes : 0);

  // ── Voice analytics — scoped by siteUrl + since to match other analytics cards
  const { data: voiceData } = useApi<VoiceAnalytics>(`/analytics/voice${analyticsParams}`, { pollMs: 20000 });

  // ── System (Operate) data ──────────────────────────────────────────────
  const { data: trainingStats } = useApi<any>("/training/stats", { pollMs: 30000 });
  const { data: qualityStats }  = useApi<any>("/training/quality/stats", { pollMs: 30000 });
  const { data: driftStatus, reload: reloadDrift } = useApi<any>("/drift/status", { pollMs: 15000 });
  const { data: driftAlerts, reload: reloadAlerts } = useApi<any>("/drift/alerts?limit=20", { pollMs: 15000 });
  const { data: nextRun }     = useApi<any>("/jobs/next-run", { pollMs: 30000 });
  const { data: jobRuns, reload: reloadJobs }         = useApi<any>("/jobs/runs?limit=10", { pollMs: 15000 });
  const { data: experiments, reload: reloadExperiments } = useApi<any>("/experiments?limit=20", { pollMs: 20000 });
  const { data: rollouts, reload: reloadRollouts }    = useApi<any>("/rollouts?limit=10", { pollMs: 20000 });

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const triggerJob = useCallback(async (job: string) => {
    setActionLoading(`job_${job}`);
    try {
      await apiFetch(`/jobs/trigger`, { method: "POST", body: JSON.stringify({ job }), headers: { "Content-Type": "application/json" } });
      reloadJobs();
    } finally { setActionLoading(null); }
  }, [reloadJobs]);

  const ackAlert = useCallback(async (id: string) => {
    setActionLoading(`ack_${id}`);
    try {
      await apiFetch(`/drift/alerts/${id}/ack`, { method: "POST" });
      reloadAlerts();
    } finally { setActionLoading(null); }
  }, [reloadAlerts]);

  const triggerDriftCheck = useCallback(async () => {
    setActionLoading("drift_check");
    try {
      await apiFetch(`/drift/check`, { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } });
      reloadDrift(); reloadAlerts();
    } finally { setActionLoading(null); }
  }, [reloadDrift, reloadAlerts]);

  const experimentAction = useCallback(async (id: string, action: "start" | "pause" | "end") => {
    setActionLoading(`exp_${id}_${action}`);
    try {
      await apiFetch(`/experiments/${id}/${action}`, { method: "POST" });
      reloadExperiments();
    } finally { setActionLoading(null); }
  }, [reloadExperiments]);

  const rolloutAction = useCallback(async (id: string, action: "start" | "promote" | "rollback" | "pause") => {
    setActionLoading(`rollout_${id}_${action}`);
    try {
      await apiFetch(`/rollouts/${id}/${action}`, { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } });
      reloadRollouts();
    } finally { setActionLoading(null); }
  }, [reloadRollouts]);

  const activeAlerts = driftAlerts?.alerts?.filter((a: any) => !a.acknowledged) ?? [];

  return (
    <div className="tab-content">

      {/* ═══════════════════════════════════════════════════════════
          ROW 1 — REVENUE RECOVERY HERO
          The $$ number that closes deals.
      ═══════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 12 }}>
        {/* Hero revenue card */}
        <div className="card" style={{ marginBottom: 8, background: "linear-gradient(135deg, rgba(107,201,160,0.08) 0%, rgba(8,26,34,0.95) 100%)", border: "1px solid rgba(107,201,160,0.2)" }}>
          <div className="card-body" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              {/* Main revenue number */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Est. Revenue Recovered Today
                </div>
                {estimatedRevenue !== null ? (
                  <>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "var(--accent)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                      ${estimatedRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {conversionsCount} conversions × ${avgCartValue.toFixed(0)} avg order value
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--muted)", lineHeight: 1.2 }}>
                    {conversionsCount > 0
                      ? `${conversionsCount} sale${conversionsCount !== 1 ? "s" : ""} recovered`
                      : totalOutcomes === 0
                        ? "Waiting for interventions..."
                        : outcomeCounts.dismissed > 0
                          ? "No conversions yet — dismissals logged"
                          : "Interventions fired — awaiting outcomes"}
                  </div>
                )}
              </div>

              {/* Supporting metrics */}
              <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                <div className="metric-box" style={{ minWidth: 80, textAlign: "center" }}>
                  <div className="label">Fired</div>
                  <div className="value">{fmtNum(eff?.fired ?? totalOutcomes)}</div>
                  <div className="sub">interventions</div>
                </div>
                <div className="metric-box" style={{ minWidth: 80, textAlign: "center" }}>
                  <div className="label">Conversion</div>
                  <div className="value accent">{totalOutcomes > 0 ? fmtPct(conversionRate) : "—"}</div>
                  <div className="sub">rate</div>
                </div>
                <div className="metric-box" style={{ minWidth: 80, textAlign: "center" }}>
                  <div className="label">Dismissed</div>
                  <div className="value warn">{totalOutcomes > 0 ? fmtPct(dismissalRate) : "—"}</div>
                  <div className="sub">rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outcome breakdown bar */}
        {totalOutcomes > 0 && (
          <div className="card">
            <div className="card-body" style={{ padding: "10px 16px" }}>
              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                Outcome Breakdown — {fmtNum(totalOutcomes)} total
              </div>
              <div className="outcome-bar" style={{ marginBottom: 6, height: 10, borderRadius: 5, overflow: "hidden" }}>
                {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                  const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                  const pct = totalOutcomes > 0 ? (val / totalOutcomes) * 100 : 0;
                  return <div key={key} className={`seg ${key}`} style={{ width: `${pct}%` }} />;
                })}
              </div>
              <div className="outcome-legend">
                {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                  const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                  const pct = totalOutcomes > 0 ? Math.round((val / totalOutcomes) * 100) : 0;
                  return (
                    <div key={key} className="leg-item">
                      <span className="leg-dot" style={{ background: outcomeColor(key) }} />
                      <span style={{ textTransform: "capitalize" }}>{key}</span>
                      <span style={{ color: "var(--muted)", marginLeft: 3 }}>({val} · {pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 1b — VOICE PERFORMANCE CARD
          Voice vs text conversion lift + mute rate.
      ═══════════════════════════════════════════════════════════ */}
      {voiceData && voiceData.voice.fired > 0 && (
        <div className="card" style={{ marginBottom: 12, border: "1px solid rgba(91,155,213,0.2)", background: "linear-gradient(135deg, rgba(91,155,213,0.06) 0%, rgba(8,26,34,0.95) 100%)" }}>
          <div className="card-head">
            <span>🔊 Voice Performance</span>
            <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: "var(--info)" }}>
              {voiceData.voice.fired} voice · {voiceData.text.fired} text
            </span>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            {/* Metric row */}
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div className="metric-box">
                <div className="label">Voice Conversion</div>
                <div className="value accent">{voiceData.voice.fired > 0 ? fmtPct(voiceData.voice.conversionRate) : "—"}</div>
                <div className="sub">{voiceData.voice.converted} / {voiceData.voice.fired} fired</div>
              </div>
              <div className="metric-box">
                <div className="label">Text Conversion</div>
                <div className="value" style={{ color: "var(--info)" }}>{voiceData.text.fired > 0 ? fmtPct(voiceData.text.conversionRate) : "—"}</div>
                <div className="sub">{voiceData.text.converted} / {voiceData.text.fired} fired</div>
              </div>
              <div className="metric-box">
                <div className="label">Voice Dismissal</div>
                <div className="value warn">{voiceData.voice.fired > 0 ? fmtPct(voiceData.voice.dismissalRate) : "—"}</div>
                <div className="sub">{voiceData.voice.dismissed} dismissed</div>
              </div>
              <div className="metric-box">
                <div className="label">Mute Rate</div>
                <div className="value" style={{ color: voiceData.sessions.muteRate > 0.2 ? "var(--tier-escalate)" : "var(--muted)" }}>
                  {voiceData.sessions.voiceActive > 0 ? fmtPct(voiceData.sessions.muteRate) : "—"}
                </div>
                <div className="sub">{voiceData.sessions.muted} / {voiceData.sessions.voiceActive} sessions</div>
              </div>
            </div>

            {/* Voice vs Text comparison bar */}
            {voiceData.voice.fired > 0 && voiceData.text.fired > 0 && (() => {
              const voiceLift = voiceData.voice.conversionRate - voiceData.text.conversionRate;
              const liftPct = Math.round(voiceLift * 100);
              const isPositive = liftPct >= 0;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--muted)" }}>
                  <span>Conversion lift vs text:</span>
                  <span style={{
                    fontWeight: 700,
                    color: isPositive ? "var(--accent)" : "var(--tier-escalate)",
                    fontSize: 12,
                  }}>
                    {isPositive ? "+" : ""}{liftPct}pp
                  </span>
                  <span style={{ opacity: 0.5 }}>
                    ({voiceData.sessions.voiceActive} voice-active sessions · {voiceData.sessions.muted} muted)
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ROW 2 — LIVE INTERVENTION FEED
          The story: what AVA did, to whom, and what happened.
      ═══════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <span>
            Intervention Feed
            <span style={{
              marginLeft: 8,
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--tier-active)",
              boxShadow: "0 0 6px var(--tier-active)",
              verticalAlign: "middle",
            }} />
          </span>
          <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>{filtered.length} interventions</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <p>Waiting for interventions...</p>
            <p className="muted" style={{ fontSize: 11 }}>
              AVA fires when MSWIM composite crosses NUDGE · ACTIVE · ESCALATE thresholds
            </p>
          </div>
        ) : (
          <div className="scroll-list">
            {filtered.map((iv, i) => {
              const statusText = iv.status ?? "sent";
              const isConverted = statusText === "converted";
              const isDismissed = statusText === "dismissed";
              return (
                <div
                  className="interv-row"
                  key={iv.intervention_id ?? i}
                  style={{
                    borderLeft: `3px solid ${isConverted ? "var(--accent)" : isDismissed ? "var(--warn)" : "transparent"}`,
                    paddingLeft: 8,
                  }}
                >
                  <span className="time">{fmtTime(iv.timestamp)}</span>

                  {/* Intervention type badge */}
                  <span style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: typeColor(iv.type) + "22",
                    color: typeColor(iv.type),
                    border: `1px solid ${typeColor(iv.type)}44`,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}>{iv.type}</span>

                  {/* Friction that triggered it */}
                  {iv.friction_id && (
                    <span className="friction-tag" style={{ flexShrink: 0 }}>{iv.friction_id}</span>
                  )}

                  {/* Voice badge */}
                  {iv.voice_enabled && (
                    <span title="Voice intervention" style={{
                      fontSize: 10,
                      flexShrink: 0,
                      opacity: 0.85,
                    }}>🔊</span>
                  )}

                  {/* The message shown to shopper */}
                  <span className="desc" style={{ flex: 1, fontSize: 11 }}>
                    {iv.message || iv.action_code}
                  </span>

                  {/* MSWIM score chip */}
                  <span className="score-chip" style={{ flexShrink: 0 }}>
                    {fmtScore(iv.mswim_score)}
                  </span>

                  {/* Outcome — the result that matters */}
                  {iv.status && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: outcomeColor(iv.status),
                      flexShrink: 0,
                      minWidth: 70,
                      textAlign: "right",
                    }}>
                      {statusIcon(iv.status)} {iv.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SYSTEM SECTION — collapsed by default
          For engineers / advanced users.
          Contains all previous Operate tab content.
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 8,
        paddingLeft: 2,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        System & ML Operations
        <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", opacity: 0.6 }}>— expand to manage</span>
      </div>

      {/* Training Data */}
      <SystemSection
        title="Training Data"
        badge={trainingStats ? `${fmtNum(trainingStats.totalCount ?? 0)} pts` : undefined}
      >
        {trainingStats ? (
          <>
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div className="metric-box">
                <div className="label">Datapoints</div>
                <div className="value">{fmtNum(trainingStats.totalCount ?? 0)}</div>
                <div className="sub">total</div>
              </div>
              <div className="metric-box">
                <div className="label">High Quality</div>
                <div className="value accent">{qualityStats ? fmtNum(qualityStats.stats?.high ?? 0) : "—"}</div>
                <div className="sub">grade: high</div>
              </div>
              <div className="metric-box">
                <div className="label">Converted</div>
                <div className="value">{fmtNum(trainingStats.outcomeDistribution?.converted ?? 0)}</div>
                <div className="sub">outcome</div>
              </div>
              <div className="metric-box">
                <div className="label">Dismissed</div>
                <div className="value warn">{fmtNum(trainingStats.outcomeDistribution?.dismissed ?? 0)}</div>
                <div className="sub">outcome</div>
              </div>
            </div>
            {qualityStats?.stats && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Quality Grades</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(["high", "medium", "low", "rejected"] as const).map((grade) => {
                    const count = qualityStats.stats[grade] ?? 0;
                    const total = Object.values(qualityStats.stats as Record<string, number>).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const color = grade === "high" ? "var(--accent)" : grade === "medium" ? "var(--info)" : grade === "low" ? "var(--warn)" : "var(--tier-escalate)";
                    return (
                      <div key={grade} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 56, fontSize: 10, color, textTransform: "capitalize" }}>{grade}</span>
                        <div style={{ flex: 1, height: 5, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 24, textAlign: "right" }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "Export JSONL", path: "/training/export/jsonl" },
                { label: "Export CSV", path: "/training/export/csv" },
                { label: "Fine-Tune JSONL", path: "/training/export/fine-tune" },
              ].map(({ label, path }) => (
                <a key={path} href={`http://localhost:8080/api${path}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, color: "var(--info)", textDecoration: "none" }}>
                  ↓ {label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">Loading training data...</p></div>
        )}
      </SystemSection>

      {/* Drift Detection */}
      <SystemSection title="Drift Detection" badge={activeAlerts.length > 0 ? `${activeAlerts.length} alerts` : undefined}>
        <div className="grid-4" style={{ marginBottom: 12 }}>
          <div className="metric-box">
            <div className="label">Tier Agreement</div>
            <div className="value" style={{ color: (driftStatus?.tierAgreementRate ?? 1) < 0.7 ? "var(--warn)" : "var(--accent)" }}>
              {driftStatus ? fmtPct(driftStatus.tierAgreementRate ?? 0) : "—"}
            </div>
            <div className="sub">shadow vs prod</div>
          </div>
          <div className="metric-box">
            <div className="label">Decision Match</div>
            <div className="value" style={{ color: (driftStatus?.decisionAgreementRate ?? 1) < 0.75 ? "var(--warn)" : "var(--accent)" }}>
              {driftStatus ? fmtPct(driftStatus.decisionAgreementRate ?? 0) : "—"}
            </div>
            <div className="sub">agreement</div>
          </div>
          <div className="metric-box">
            <div className="label">Avg Divergence</div>
            <div className="value warn">{driftStatus ? fmtScore(driftStatus.avgCompositeDivergence ?? 0) : "—"}</div>
            <div className="sub">composite pts</div>
          </div>
          <div className="metric-box">
            <div className="label">Active Alerts</div>
            <div className="value" style={{ color: activeAlerts.length > 0 ? "var(--tier-escalate)" : "var(--accent)" }}>
              {activeAlerts.length}
            </div>
            <div className="sub">unacknowledged</div>
          </div>
        </div>
        {activeAlerts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Active Alerts</div>
            <div className="scroll-list" style={{ maxHeight: 200 }}>
              {activeAlerts.map((alert: any) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: severityColor(alert.severity) + "22", color: severityColor(alert.severity), flexShrink: 0 }}>
                    {alert.severity}
                  </span>
                  <span style={{ fontSize: 10, flex: 1, color: "var(--text)" }}>{alert.message}</span>
                  <button onClick={() => ackAlert(alert.id)} disabled={actionLoading === `ack_${alert.id}`}
                    style={{ fontSize: 9, padding: "2px 7px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, color: "var(--muted)", cursor: "pointer", flexShrink: 0 }}>
                    Ack
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={triggerDriftCheck} disabled={actionLoading === "drift_check"}
          style={{ fontSize: 10, padding: "5px 12px", background: "rgba(91,155,213,0.15)", border: "1px solid rgba(91,155,213,0.3)", borderRadius: 4, color: "var(--info)", cursor: "pointer" }}>
          {actionLoading === "drift_check" ? "Running..." : "Run Drift Check"}
        </button>
      </SystemSection>

      {/* Scheduled Jobs */}
      <SystemSection title="Scheduled Jobs">
        {nextRun && (
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <div className="metric-box">
              <div className="label">Next Run</div>
              <div className="value" style={{ fontSize: 13 }}>{nextRun.nextRun ? new Date(nextRun.nextRun).toLocaleTimeString() : "—"}</div>
              <div className="sub">scheduled</div>
            </div>
            <div className="metric-box">
              <div className="label">Last Run</div>
              <div className="value" style={{ fontSize: 13, color: jobStatusColor(nextRun.lastRun?.status ?? "") }}>
                {nextRun.lastRun?.status ?? "—"}
              </div>
              <div className="sub">{nextRun.lastRun?.durationMs ? `${Math.round(nextRun.lastRun.durationMs / 1000)}s` : "—"}</div>
            </div>
            <div className="metric-box" style={{ gridColumn: "span 2" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Nightly Batch", job: "nightly_batch" },
                  { label: "Drift Check", job: "drift_check" },
                  { label: "Rollout Health", job: "rollout_health" },
                ].map(({ label, job }) => (
                  <button key={job} onClick={() => triggerJob(job)} disabled={actionLoading === `job_${job}`}
                    style={{ fontSize: 9, padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, color: "var(--muted)", cursor: "pointer" }}>
                    {actionLoading === `job_${job}` ? "Running..." : `▶ ${label}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="scroll-list" style={{ maxHeight: 200 }}>
          {(jobRuns?.runs ?? []).map((run: any) => (
            <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 9, minWidth: 56, color: jobStatusColor(run.status) }}>{run.status}</span>
              <span style={{ fontSize: 10, flex: 1, color: "var(--text)" }}>{run.jobName}</span>
              <span className="mono muted" style={{ fontSize: 9 }}>{run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : "—"}</span>
              <span className="mono muted" style={{ fontSize: 9 }}>{run.startedAt ? fmtTime(run.startedAt) : ""}</span>
            </div>
          ))}
        </div>
      </SystemSection>

      {/* A/B Experiments */}
      <SystemSection title="A/B Experiments" badge={`${experiments?.count ?? 0} total`}>
        {(experiments?.experiments ?? []).length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">No experiments yet</p></div>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 320 }}>
            {(experiments?.experiments ?? []).map((exp: any) => (
              <div key={exp.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", flex: 1 }}>{exp.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: exp.status === "running" ? "rgba(107,201,160,0.2)" : "rgba(255,255,255,0.06)", color: exp.status === "running" ? "var(--accent)" : "var(--muted)" }}>
                    {exp.status}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 6 }}>
                  Traffic: {exp.trafficPercent}% · Metric: {exp.primaryMetric}{exp.siteUrl ? ` · ${exp.siteUrl}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {exp.status === "draft" && <button onClick={() => experimentAction(exp.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Start</button>}
                  {exp.status === "running" && <>
                    <button onClick={() => experimentAction(exp.id, "pause")} disabled={!!actionLoading} style={actionBtnStyle("var(--warn)")}>Pause</button>
                    <button onClick={() => experimentAction(exp.id, "end")} disabled={!!actionLoading} style={actionBtnStyle("var(--muted)")}>End</button>
                  </>}
                  {exp.status === "paused" && <button onClick={() => experimentAction(exp.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Resume</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SystemSection>

      {/* Gradual Rollouts */}
      <SystemSection title="Gradual Rollouts" badge={`${rollouts?.count ?? 0} total`}>
        {(rollouts?.rollouts ?? []).length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">No rollouts yet</p></div>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 320 }}>
            {(rollouts?.rollouts ?? []).map((rollout: any) => (
              <div key={rollout.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", flex: 1 }}>{rollout.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: rolloutStatusColor(rollout.status) + "22", color: rolloutStatusColor(rollout.status) }}>
                    {rollout.status}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 6 }}>
                  Stage {rollout.currentStage + 1} · {rollout.changeType}{rollout.siteUrl ? ` · ${rollout.siteUrl}` : ""}{rollout.lastHealthStatus ? ` · Health: ${rollout.lastHealthStatus}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {rollout.status === "pending" && <button onClick={() => rolloutAction(rollout.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Start</button>}
                  {rollout.status === "rolling" && <>
                    <button onClick={() => rolloutAction(rollout.id, "promote")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Promote</button>
                    <button onClick={() => rolloutAction(rollout.id, "pause")} disabled={!!actionLoading} style={actionBtnStyle("var(--warn)")}>Pause</button>
                    <button onClick={() => rolloutAction(rollout.id, "rollback")} disabled={!!actionLoading} style={actionBtnStyle("var(--tier-escalate)")}>Rollback</button>
                  </>}
                  {rollout.status === "paused" && <>
                    <button onClick={() => rolloutAction(rollout.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Resume</button>
                    <button onClick={() => rolloutAction(rollout.id, "rollback")} disabled={!!actionLoading} style={actionBtnStyle("var(--tier-escalate)")}>Rollback</button>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SystemSection>

      {/* Webhook Deliveries */}
      <SystemSection title="Webhook Deliveries" badge={webhookStats ? `${fmtPct(webhookStats.stats.successRate)} success` : undefined}>
        {webhookStats ? (
          <>
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div className="metric-box">
                <div className="label">Total</div>
                <div className="value">{fmtNum(webhookStats.stats.total)}</div>
                <div className="sub">session-exit hooks</div>
              </div>
              <div className="metric-box">
                <div className="label">Delivered</div>
                <div className="value" style={{ color: "var(--accent)" }}>{fmtNum(webhookStats.stats.delivered)}</div>
                <div className="sub">{fmtPct(webhookStats.stats.successRate)}</div>
              </div>
              <div className="metric-box">
                <div className="label">Failed</div>
                <div className="value" style={{ color: webhookStats.stats.failed > 0 ? "var(--tier-escalate)" : "var(--muted)" }}>
                  {fmtNum(webhookStats.stats.failed)}
                </div>
                <div className="sub">after retries</div>
              </div>
              <div className="metric-box">
                <div className="label">Pending</div>
                <div className="value" style={{ color: webhookStats.stats.pending > 0 ? "var(--warn)" : "var(--muted)" }}>
                  {fmtNum(webhookStats.stats.pending)}
                </div>
                <div className="sub">queued</div>
              </div>
            </div>
            {webhookStats.recent.length > 0 && (
              <div className="scroll-list" style={{ maxHeight: 200 }}>
                {webhookStats.recent.map((rec) => (
                  <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 9, minWidth: 52, padding: "2px 5px", borderRadius: 3,
                      background: rec.status === "delivered" ? "rgba(107,201,160,0.15)" : rec.status === "failed" ? "rgba(220,80,80,0.15)" : "rgba(255,255,255,0.06)",
                      color: rec.status === "delivered" ? "var(--accent)" : rec.status === "failed" ? "var(--tier-escalate)" : "var(--muted)" }}>
                      {rec.status}
                    </span>
                    <span className="mono muted" style={{ fontSize: 9, flex: 1 }}>{rec.sessionId.slice(0, 8)}…</span>
                    <span className="mono muted" style={{ fontSize: 9 }}>{rec.attempts} att</span>
                    {rec.responseCode && <span className="mono" style={{ fontSize: 9, color: rec.responseCode < 300 ? "var(--accent)" : "var(--warn)" }}>{rec.responseCode}</span>}
                    <span className="mono muted" style={{ fontSize: 9 }}>{fmtTime(rec.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">No webhook data — configure a webhook URL in site settings.</p></div>
        )}
      </SystemSection>

    </div>
  );
}
