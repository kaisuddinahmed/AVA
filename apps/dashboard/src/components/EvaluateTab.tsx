import { useMemo, useState } from "react";
import type { BehaviorGroup, EvaluationData, OverviewAnalytics, ScoreTier } from "../types";
import { fmtTime, fmtNum, fmtPct, fmtScore, tierColor } from "../lib/format";
import { SignalBars } from "./SignalBars";
import { CompositeRing } from "./CompositeRing";

const BEHAVIOR_GROUP_COLOR: Record<BehaviorGroup, string> = {
  HIGH_INTENT: "#22c55e",
  COMPARISON:  "#38bdf8",
  HESITATION:  "#f59e0b",
  DISCOVERY:   "#6b7280",
  EXIT_RISK:   "#ef4444",
};

interface Props {
  evaluations: EvaluationData[];
  selectedSession: string | null;
  overview: OverviewAnalytics | null;
  shadowStats: any | null;
  shadowDivergences: any[] | null;
}

const TIERS: ScoreTier[] = ["MONITOR", "PASSIVE", "NUDGE", "ACTIVE", "ESCALATE"];

/** Plain-English labels for each tier — business-owner friendly */
const TIER_PLAIN: Record<ScoreTier, string> = {
  MONITOR:  "just browsing, no risk",
  PASSIVE:  "mild interest, low urgency",
  NUDGE:    "showing intent, light friction",
  ACTIVE:   "at-risk of leaving — intervening",
  ESCALATE: "high-risk, immediate action",
};

function compositeToTier(score: number): ScoreTier {
  if (score >= 80) return "ESCALATE";
  if (score >= 65) return "ACTIVE";
  if (score >= 50) return "NUDGE";
  if (score >= 30) return "PASSIVE";
  return "MONITOR";
}

/** Collapsible section for the shadow/dev section */
function DevSection({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.6 }}>{open ? "▲ collapse" : "▼ expand"}</span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

export function EvaluateTab({ evaluations, selectedSession, overview, shadowStats, shadowDivergences }: Props) {
  const filtered = useMemo(
    () => selectedSession ? evaluations.filter((e) => e.session_id === selectedSession) : evaluations,
    [evaluations, selectedSession]
  );

  const tierDist = useMemo(() => {
    if (overview?.tierDistribution) return overview.tierDistribution;
    const dist: Record<string, number> = {};
    for (const e of filtered) {
      const t = e.mswim.tier;
      dist[t] = (dist[t] ?? 0) + 1;
    }
    return dist;
  }, [overview, filtered]);

  const totalTier = Object.values(tierDist).reduce((a, b) => a + b, 0);
  const latest = filtered[0] ?? null;

  const avgComposite = useMemo(() => {
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, e) => sum + e.mswim.composite_score, 0) / filtered.length;
  }, [filtered]);

  // Counts for AI summary card
  const atRiskCount = useMemo(() => {
    const active = (tierDist as Record<string, number>)["ACTIVE"] ?? 0;
    const escalate = (tierDist as Record<string, number>)["ESCALATE"] ?? 0;
    return active + escalate;
  }, [tierDist]);

  const escalatedCount = useMemo(() => {
    return (tierDist as Record<string, number>)["ESCALATE"] ?? 0;
  }, [tierDist]);

  const totalEvals = overview?.totalEvaluations ?? filtered.length;

  return (
    <div className="tab-content">

      {/* ═══════════════════════════════════════════════════════════
          ROW 1 — AI SUMMARY CARD  (plain English for business owners)
          "Here's what AVA's AI is seeing right now."
      ═══════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            {/* Left: headline summary */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                AVA Intelligence Summary
              </div>
              {totalEvals === 0 ? (
                <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
                  Waiting for sessions to evaluate...
                </div>
              ) : (
                <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>{fmtNum(totalEvals)}</span> sessions evaluated today
                  {atRiskCount > 0 ? (
                    <>
                      {" · "}
                      <span style={{ color: "var(--tier-active)", fontWeight: 700 }}>{fmtNum(atRiskCount)}</span> at active risk right now
                    </>
                  ) : (
                    <> · <span style={{ color: "var(--accent)" }}>no high-risk sessions</span></>
                  )}
                  {escalatedCount > 0 && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--tier-escalate)", fontWeight: 700 }}>{fmtNum(escalatedCount)}</span> escalated
                    </>
                  )}
                  {latest?.engine && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--muted)" }}>engine: </span>
                      <span style={{ color: "var(--info)" }}>{latest.engine.toUpperCase()}</span>
                    </>
                  )}
                </div>
              )}
              {latest && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                  Latest session classified as{" "}
                  <span style={{ color: tierColor(latest.mswim.tier), fontWeight: 700 }}>{latest.mswim.tier}</span>
                  {" "}— {TIER_PLAIN[latest.mswim.tier as ScoreTier] ?? "unknown"}.
                  {latest.mswim.gate_override && (
                    <> Gate override: <span className="gate-tag" style={{ marginLeft: 4 }}>{latest.mswim.gate_override}</span></>
                  )}
                </div>
              )}
            </div>
            {/* Right: current composite + avg */}
            <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
              <div className="metric-box" style={{ minWidth: 80, textAlign: "center" }}>
                <div className="label">Now</div>
                <div className="value" style={{ color: latest ? tierColor(latest.mswim.tier) : undefined }}>
                  {latest ? fmtScore(latest.mswim.composite_score) : "—"}
                </div>
                <div className="sub">{latest?.mswim.tier ?? "waiting"}</div>
              </div>
              <div className="metric-box" style={{ minWidth: 80, textAlign: "center" }}>
                <div className="label">Avg Score</div>
                <div className="value" style={{ color: tierColor(compositeToTier(avgComposite)) }}>
                  {totalEvals > 0 ? fmtScore(avgComposite) : "—"}
                </div>
                <div className="sub">{totalEvals > 0 ? compositeToTier(avgComposite) : "no data"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 2 — SIGNAL STATE + TIER DISTRIBUTION
          The MSWIM scoring view — how AVA is weighing each signal.
      ═══════════════════════════════════════════════════════════ */}
      <div className="grid-2" style={{ marginBottom: 12 }}>
        {/* MSWIM Composite + Signal Bars */}
        <div className="card">
          <div className="card-head">Current MSWIM Signal State</div>
          <div className="card-body">
            {latest ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                  <CompositeRing score={latest.mswim.composite_score} tier={latest.mswim.tier} />
                  <div style={{ flex: 1 }}>
                    <SignalBars signals={latest.mswim.signals} />
                  </div>
                </div>
                {/* Signal plain-English hint */}
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                  {buildSignalHint(latest.mswim.signals)}
                </div>
                {latest.mswim.gate_override && (
                  <div style={{ marginTop: 8 }}>
                    <span className="gate-tag">{latest.mswim.gate_override}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <p className="muted">Waiting for first evaluation...</p>
              </div>
            )}
          </div>
        </div>

        {/* Tier Distribution */}
        <div className="card">
          <div className="card-head">
            Session Risk Distribution
            <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, marginLeft: 8, opacity: 0.6 }}>
              {fmtNum(totalTier)} sessions
            </span>
          </div>
          <div className="card-body">
            {totalTier === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                <p className="muted">No evaluations yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TIERS.map((tier) => {
                  const count = (tierDist as Record<string, number>)[tier] ?? 0;
                  const pct = totalTier > 0 ? (count / totalTier) * 100 : 0;
                  return (
                    <div key={tier}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span className="tier-badge" style={{ minWidth: 72, justifyContent: "center", color: tierColor(tier), borderColor: tierColor(tier) }}>
                          {tier}
                        </span>
                        <div style={{ flex: 1, height: 6, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: tierColor(tier), borderRadius: 3, transition: "width 400ms ease" }} />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 28, textAlign: "right" }}>{count}</span>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted)", paddingLeft: 84 }}>{TIER_PLAIN[tier]}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 3 — FRICTION HOTSPOTS
          What's blocking conversion across all sessions.
      ═══════════════════════════════════════════════════════════ */}
      {overview?.frictionHotspots && overview.frictionHotspots.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            Friction Hotspots
            <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, marginLeft: 8, opacity: 0.6 }}>
              recurring blockers across sessions
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {overview.frictionHotspots.slice(0, 8).map((f, i) => (
                <div key={f.frictionId} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  background: "rgba(8,26,34,0.5)",
                  borderRadius: 4,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <span style={{ fontSize: 9, color: "var(--muted)", minWidth: 16, textAlign: "right", opacity: 0.5 }}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--warn)" }}>{f.frictionId}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "capitalize" }}>{f.category}</div>
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: f.count >= 10 ? "var(--tier-escalate)" : f.count >= 5 ? "var(--warn)" : "var(--muted)",
                  }}>{f.count}×</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ROW 4 — EVALUATION FEED
          The AI's running commentary on each session.
      ═══════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <span>AI Evaluation Feed</span>
          <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>{filtered.length} evaluations</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧠</div>
            <p>Waiting for evaluations...</p>
            <p className="muted" style={{ fontSize: 11 }}>Events are buffered and evaluated in batches</p>
          </div>
        ) : (
          <div className="scroll-list">
            {filtered.map((ev, i) => (
              <div className="eval-row" key={ev.evaluation_id ?? i}>
                <div className="eval-header">
                  <span className="time">{fmtTime(ev.timestamp)}</span>
                  <span className={`tier-badge ${ev.mswim.tier}`} style={{ color: tierColor(ev.mswim.tier), borderColor: tierColor(ev.mswim.tier) }}>{ev.mswim.tier}</span>
                  <span className="mono muted" style={{ fontSize: 10 }}>composite {fmtScore(ev.mswim.composite_score)}</span>
                  {ev.mswim.gate_override && <span className="gate-tag">{ev.mswim.gate_override}</span>}
                  {ev.engine && (
                    <span className="signal-chip">
                      <span className="signal-label">engine</span>
                      <span className="signal-value">{ev.engine}</span>
                    </span>
                  )}
                </div>
                <div className="signal-bar">
                  {Object.entries(ev.mswim.signals).map(([key, val]) => (
                    <span className="signal-chip" key={key}>
                      <span className="signal-label">{key.slice(0, 3)}</span>
                      <span className="signal-value">{fmtScore(val)}</span>
                    </span>
                  ))}
                </div>
                {ev.frictions_found.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ev.frictions_found.map((f, fi) => (
                      <span key={fi} className="friction-tag" style={{ fontSize: 9 }}>
                        {f.friction_id} ({(f.confidence * 100).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                )}
                {ev.behavior_patterns && ev.behavior_patterns.length > 0 && (
                  <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "var(--muted)", marginRight: 2 }}>behavior:</span>
                    {/* Deduplicate groups and show color-coded chips */}
                    {[...new Map(ev.behavior_patterns.map((p) => [p.group, p])).values()].map((p) => (
                      <span
                        key={p.group}
                        title={`${p.group}: ${ev.behavior_patterns!.filter((x) => x.group === p.group).map((x) => `${x.patternId} (${(x.confidence * 100).toFixed(0)}%)`).join(", ")}`}
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 10,
                          border: `1px solid ${BEHAVIOR_GROUP_COLOR[p.group]}`,
                          color: BEHAVIOR_GROUP_COLOR[p.group],
                          background: `${BEHAVIOR_GROUP_COLOR[p.group]}14`,
                          cursor: "default",
                        }}
                      >
                        {p.group.replace("_", " ")}
                      </span>
                    ))}
                    <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: 2 }}>
                      ({ev.behavior_patterns.length} pattern{ev.behavior_patterns.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                )}
                {ev.narrative && <div className="narrative">{ev.narrative}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 5 — SHADOW MODE  (collapsed by default — dev-facing)
          Compare MSWIM-only vs LLM+MSWIM accuracy.
      ═══════════════════════════════════════════════════════════ */}
      {shadowStats && (
        <DevSection title="Shadow Mode — MSWIM vs LLM+MSWIM (Dev)">
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <div className="metric-box">
              <div className="label">Tier Match</div>
              <div className="value">{fmtPct(shadowStats.tierMatchRate ?? 0)}</div>
              <div className="sub">agreement</div>
            </div>
            <div className="metric-box">
              <div className="label">Decision Match</div>
              <div className="value">{fmtPct(shadowStats.decisionMatchRate ?? 0)}</div>
              <div className="sub">agreement</div>
            </div>
            <div className="metric-box">
              <div className="label">Avg Divergence</div>
              <div className="value warn">{fmtScore(shadowStats.avgCompositeDivergence ?? 0)}</div>
              <div className="sub">composite pts</div>
            </div>
            <div className="metric-box">
              <div className="label">Comparisons</div>
              <div className="value">{fmtNum(shadowStats.totalComparisons ?? 0)}</div>
              <div className="sub">total</div>
            </div>
          </div>
          {shadowDivergences && shadowDivergences.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Top Divergences</div>
              {shadowDivergences.slice(0, 5).map((d: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="tier-badge" style={{ color: tierColor(d.prodTier), borderColor: tierColor(d.prodTier) }}>{d.prodTier}</span>
                  <span style={{ fontSize: 9, color: "var(--muted)" }}>→</span>
                  <span className="tier-badge" style={{ color: tierColor(d.shadowTier), borderColor: tierColor(d.shadowTier) }}>{d.shadowTier}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--warn)", marginLeft: "auto" }}>Δ{fmtScore(d.compositeDivergence)}</span>
                </div>
              ))}
            </div>
          )}
        </DevSection>
      )}
    </div>
  );
}

/** Build a one-line plain-English signal hint from 5 MSWIM signals */
function buildSignalHint(signals: { intent: number; friction: number; clarity: number; receptivity: number; value: number }): string {
  const hints: string[] = [];
  if (signals.intent >= 70) hints.push("strong purchase intent");
  else if (signals.intent <= 30) hints.push("low intent");
  if (signals.friction >= 60) hints.push("high friction detected");
  else if (signals.friction <= 20) hints.push("friction-free");
  if (signals.receptivity >= 70) hints.push("receptive to messages");
  else if (signals.receptivity <= 25) hints.push("low receptivity");
  if (signals.value >= 65) hints.push("high cart value");
  if (hints.length === 0) return "Signals within normal range.";
  return hints.join(", ") + ".";
}
