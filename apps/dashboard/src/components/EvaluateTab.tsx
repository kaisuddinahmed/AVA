import { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MswimSignals {
  intent: number; friction: number; clarity: number; receptivity: number; value: number;
}
interface Mswim {
  tier: 'MONITOR' | 'PASSIVE' | 'NUDGE' | 'ACTIVE' | 'ESCALATE';
  composite_score: number;
  signals: MswimSignals;
  gate_override?: string;
}
interface Evaluation {
  id?: string; session_id: string; mswim: Mswim; narrative?: string;
  frictionId?: string; friction_id?: string; engine?: string;
  intervention_id?: string; timestamp?: number; createdAt?: string;
}
interface OverviewData {
  activeSessions?: number; totalEvaluations?: number;
  tierDistribution?: Record<string, number>; totalAttributedRevenue?: number;
  interventionEfficiency?: { fired: number; converted: number; conversionRate: number; dismissalRate: number; };
}
interface FrictionItem {
  frictionId: string; category: string; count: number;
  resolutionRate?: number; avgSeverity?: number | null; confidence?: string;
}
interface FrictionAnalytics { byFriction: FrictionItem[]; }
interface RevenueAttribution {
  totalAttributedRevenue: number; interventionsFired: number;
  sampleSize?: number; sessionsImpacted?: number;
}
interface ShadowStats {
  tierAgreementRate?: number; decisionAgreementRate?: number; avgCompositeDivergence?: number;
}
interface EvaluateTabProps {
  evaluations: Evaluation[]; selectedSession: string | null;
  overview: OverviewData | null; shadowStats: ShadowStats | null;
  shadowDivergences: unknown[] | null; frictionAnalytics: FrictionAnalytics | null;
  revenueAttribution: RevenueAttribution | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString('en-US'); }
function pct(n: number | undefined | null) { return n != null ? `${(n * 100).toFixed(1)}%` : '—'; }
function scoreStr(n: number) { return Math.round(n).toString(); }

function tierColor(tier: string) {
  const map: Record<string, string> = {
    MONITOR: 'var(--tier-monitor)', PASSIVE: 'var(--tier-passive)',
    NUDGE: 'var(--tier-nudge)', ACTIVE: 'var(--tier-active)', ESCALATE: 'var(--tier-escalate)',
  };
  return map[tier] ?? 'var(--muted)';
}
function tierDesc(tier: string) {
  const map: Record<string, string> = {
    MONITOR: 'just browsing, no risk', PASSIVE: 'mild interest, low urgency',
    NUDGE: 'showing intent, light friction', ACTIVE: 'at-risk of leaving — intervening',
    ESCALATE: 'high-risk, immediate action',
  };
  return map[tier] ?? '';
}
function scoreToTier(s: number) {
  if (s >= 80) return 'ESCALATE'; if (s >= 65) return 'ACTIVE';
  if (s >= 50) return 'NUDGE'; if (s >= 30) return 'PASSIVE'; return 'MONITOR';
}

const SIGNAL_KEYS: Array<{ key: keyof MswimSignals; label: string; color: string }> = [
  { key: 'intent',      label: 'INT', color: '#59b8e6' },
  { key: 'friction',    label: 'FRI', color: '#ff9d65' },
  { key: 'clarity',     label: 'CLR', color: '#35d3a1' },
  { key: 'receptivity', label: 'REC', color: '#f0c75e' },
  { key: 'value',       label: 'VAL', color: '#c888e5' },
];

function formatTime(ts: number | string | undefined) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'string' ? ts : ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalChips({ signals }: { signals: MswimSignals }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {SIGNAL_KEYS.map(({ key, label, color }) => {
        const val = Math.round(signals[key] ?? 0);
        return (
          <div key={key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 6px', borderRadius: 3,
            background: 'rgba(6,20,30,0.8)', border: `1px solid ${color}33`,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.03em' }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color }}>{val}</span>
            <div style={{ width: 20, height: 3, background: 'rgba(8,26,34,0.8)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, val)}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreRing({ score: s, tier }: { score: number; tier: string }) {
  const size = 56; const r = (size - 6) / 2; const circ = 2 * Math.PI * r;
  const fill = Math.min(100, Math.max(0, s)); const dash = circ - (fill / 100) * circ;
  const color = tierColor(tier);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(8,26,34,0.8)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color,
      }}>{Math.round(s)}</div>
    </div>
  );
}

function EvalRow({ ev }: { ev: Evaluation }) {
  const mswim = ev.mswim ?? { tier: 'MONITOR' as const, composite_score: 0, signals: { intent: 0, friction: 0, clarity: 0, receptivity: 0, value: 0 } };
  const [expanded, setExpanded] = useState(false);
  const fId = ev.frictionId || ev.friction_id;
  const ts = ev.timestamp ?? (ev.createdAt ? new Date(ev.createdAt).getTime() : undefined);
  const color = tierColor(mswim.tier);
  const sc = mswim.composite_score;
  const isHighRisk = mswim.tier === 'ACTIVE' || mswim.tier === 'ESCALATE';

  return (
    <div
      style={{
        padding: '10px 18px', borderBottom: '1px solid rgba(26,61,74,0.45)',
        borderLeft: `3px solid ${color}${isHighRisk ? 'cc' : '44'}`,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(53,211,161,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', minWidth: 72, flexShrink: 0 }}>
          {formatTime(ts)}
        </span>
        <span className={`tier-badge ${mswim.tier}`} style={{ flexShrink: 0 }}>{mswim.tier}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, maxWidth: 120, flexShrink: 0 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(8,26,34,0.7)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${sc}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, fontWeight: 700, minWidth: 22 }}>{Math.round(sc)}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.session_id.slice(0, 16)}…
        </span>
        {fId && <span className="friction-tag" style={{ flexShrink: 0 }}>{fId}</span>}
        {ev.intervention_id && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'rgba(53,211,161,0.15)', border: '1px solid rgba(53,211,161,0.4)', borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>
            🎙 VOICE
          </span>
        )}
        {ev.engine && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>
            {ev.engine.toUpperCase()}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(26,61,74,0.4)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <ScoreRing score={mswim.composite_score} tier={mswim.tier} />
            <div style={{ flex: 1 }}>
              <SignalChips signals={mswim.signals} />
              {ev.narrative && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{ev.narrative}</div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ color }}>{mswim.tier}</span>{' — '}{tierDesc(mswim.tier)}
                {mswim.gate_override && <span className="gate-tag" style={{ marginLeft: 8 }}>{mswim.gate_override}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analytics Panels ─────────────────────────────────────────────────────────

function EmptySlate({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--muted)', gap: 8 }}>
      <span style={{ fontSize: 28, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

function FrictionPanel({ frictionAnalytics }: { frictionAnalytics: FrictionAnalytics | null }) {
  const items = frictionAnalytics?.byFriction ?? [];
  if (items.length === 0) return <EmptySlate icon="✅" message="No friction detected yet — great sign!" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {items.slice(0, 10).map(f => {
        const res = f.resolutionRate ?? 0;
        const sev = f.avgSeverity ?? 0;
        return (
          <div key={f.frictionId} style={{
            display: 'grid', gridTemplateColumns: '52px 80px 1fr 52px 48px',
            gap: 10, alignItems: 'center', padding: '6px 10px',
            background: 'rgba(6,20,30,0.5)', borderRadius: 5, fontSize: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn)' }}>{f.frictionId}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{f.category}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 5, background: 'rgba(8,26,34,0.7)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${res * 100}%`, height: '100%', background: res >= 0.5 ? 'var(--accent)' : res >= 0.3 ? 'var(--tier-nudge)' : 'var(--warn)', borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', minWidth: 28 }}>{pct(res)} res</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', textAlign: 'right' }}>{fmt(f.count)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: sev >= 70 ? 'var(--tier-escalate)' : sev >= 40 ? 'var(--warn)' : 'var(--muted)', textAlign: 'right' }}>
              sev {Math.round(sev)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RevenuePanel({ revenueAttribution }: { revenueAttribution: RevenueAttribution | null }) {
  if (!revenueAttribution) return <EmptySlate icon="💰" message="Revenue data loading…" />;
  return (
    <div className="grid-4">
      {[
        { label: 'Total Attributed', value: `$${(revenueAttribution.totalAttributedRevenue ?? 0).toFixed(2)}`, color: 'var(--accent)' },
        { label: 'Interventions Fired', value: fmt(revenueAttribution.interventionsFired), color: 'var(--text)' },
        { label: 'Sessions Impacted', value: fmt(revenueAttribution.sessionsImpacted ?? 0), color: 'var(--info)' },
        { label: 'Sample Size', value: fmt(revenueAttribution.sampleSize ?? 0), color: 'var(--muted)' },
      ].map(m => (
        <div key={m.label} className="metric-box">
          <div className="label">{m.label}</div>
          <div className="value" style={{ color: m.color }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}

function ShadowPanel({ shadowStats }: { shadowStats: ShadowStats | null }) {
  if (!shadowStats) return <EmptySlate icon="🔬" message="Shadow mode not enabled" />;
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
        DEVELOPER · shadow evaluation vs production
      </div>
      <div className="grid-3">
        {[
          {
            label: 'Tier Agreement',
            value: shadowStats.tierAgreementRate !== undefined ? pct(shadowStats.tierAgreementRate) : '—',
            color: (shadowStats.tierAgreementRate ?? 1) < 0.7 ? 'var(--warn)' : 'var(--accent)',
            sub: 'shadow vs prod',
          },
          {
            label: 'Decision Match',
            value: shadowStats.decisionAgreementRate !== undefined ? pct(shadowStats.decisionAgreementRate) : '—',
            color: (shadowStats.decisionAgreementRate ?? 1) < 0.75 ? 'var(--warn)' : 'var(--accent)',
            sub: 'agreement',
          },
          {
            label: 'Avg Divergence',
            value: shadowStats.avgCompositeDivergence !== undefined ? scoreStr(shadowStats.avgCompositeDivergence) : '—',
            color: 'var(--warn)',
            sub: 'composite pts',
          },
        ].map(m => (
          <div key={m.label} className="metric-box">
            <div className="label">{m.label}</div>
            <div className="value" style={{ color: m.color }}>{m.value}</div>
            <div className="sub">{m.sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const EVAL_ANALYTICS_TABS = [
  { id: 'friction',  label: 'Friction Intelligence' },
  { id: 'revenue',   label: 'Revenue Attribution' },
  { id: 'shadow',    label: 'Shadow Mode' },
] as const;
type EvalAnalyticsTab = typeof EVAL_ANALYTICS_TABS[number]['id'];

// ─── Main Component ───────────────────────────────────────────────────────────

export function EvaluateTab({
  evaluations, selectedSession, overview,
  shadowStats, frictionAnalytics, revenueAttribution,
}: EvaluateTabProps) {
  const [analyticsTab, setAnalyticsTab] = useState<EvalAnalyticsTab>('friction');

  const filtered = useMemo(() =>
    selectedSession ? evaluations.filter(e => e.session_id === selectedSession) : evaluations,
    [evaluations, selectedSession]
  );

  const tierDist = useMemo(() => {
    if (overview?.tierDistribution) return overview.tierDistribution;
    const dist: Record<string, number> = {};
    for (const ev of filtered) {
      const t = ev.mswim?.tier ?? 'MONITOR';
      dist[t] = (dist[t] ?? 0) + 1;
    }
    return dist;
  }, [overview, filtered]);

  const throughput = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    return filtered.filter(e => {
      const ts = e.timestamp ?? (e.createdAt ? new Date(e.createdAt).getTime() : 0);
      return ts > cutoff;
    }).length;
  }, [filtered]);

  const latest = filtered[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── HERO: AI Evaluation Feed ──────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: '58vh', minHeight: 280,
        display: 'flex', flexDirection: 'column',
        padding: '14px 20px 0',
        background: 'var(--bg)',
      }}>
        <div className="card" style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(53,211,161,0.1)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '10px 18px', borderBottom: '1px solid var(--line)',
            background: 'var(--surface)', flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}>
                AI Evaluation Feed
              </span>
              {latest && (
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 12 }}>
                  Latest: <span style={{ color: tierColor(latest.mswim?.tier ?? 'MONITOR'), fontWeight: 700 }}>{latest.mswim?.tier ?? 'MONITOR'}</span>
                  {' — '}{tierDesc(latest.mswim?.tier ?? 'MONITOR')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
              {throughput > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{throughput}/min</span>
              )}
              {(['ESCALATE', 'ACTIVE', 'NUDGE', 'PASSIVE', 'MONITOR'] as const).map(t => {
                const count = tierDist[t] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className={`tier-badge ${t}`} style={{ padding: '1px 6px', fontSize: 9 }}>{t}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feed */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🧠</div>
                <p>No evaluations yet</p>
                <p className="muted">Events are buffered and evaluated in batches</p>
              </div>
            ) : filtered.map((ev, i) => (
              <EvalRow key={ev.id ?? `${ev.session_id}-${i}`} ev={ev} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Analytics Tab Strip ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 20px' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--line)',
            background: 'var(--surface)', flexShrink: 0,
          }}>
            {EVAL_ANALYTICS_TABS.map(tab => {
              const active = analyticsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setAnalyticsTab(tab.id)}
                  style={{
                    padding: '9px 18px', fontSize: 11, fontWeight: active ? 700 : 400,
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    background: 'transparent', border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    letterSpacing: '0.06em', transition: 'color 0.15s', marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px' }}>
            {analyticsTab === 'friction' && <FrictionPanel frictionAnalytics={frictionAnalytics} />}
            {analyticsTab === 'revenue'  && <RevenuePanel revenueAttribution={revenueAttribution} />}
            {analyticsTab === 'shadow'   && <ShadowPanel shadowStats={shadowStats} />}
          </div>
        </div>
      </div>

    </div>
  );
}
