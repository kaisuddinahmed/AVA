import { useState, useMemo, useCallback } from 'react';
import { useApi, apiFetch } from '../hooks/use-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Intervention {
  intervention_id: string; session_id: string;
  status?: 'converted' | 'delivered' | 'dismissed' | 'ignored' | 'sent';
  type?: string; composite_score?: number; friction_id?: string; frictionId?: string;
  voice_enabled?: boolean; voice_script?: string; timestamp?: number; createdAt?: string;
  revenue_impact?: number;
}
interface Session { id: string; cartValue: number; siteUrl?: string; }
interface OverviewData {
  activeSessions?: number;
  interventionEfficiency?: { fired: number; converted: number; conversionRate: number; dismissalRate: number; totalAttributedRevenue?: number; };
  totalAttributedRevenue?: number;
}
interface WebhookStats {
  totalDelivered?: number; failed?: number; successRate?: number;
  endpoints?: Array<{ url: string; delivered: number; failed: number; lastStatus?: number }>;
}
interface NetworkStatus { contributionSessions?: number; totalPatterns?: number; site?: { contributionSessions?: number }; }
interface VoiceData {
  totalSessions?: number; avgPerSession?: number; conversionRate?: number;
  breakdown?: Array<{ type: string; count: number; converted: number }>;
}
interface TrainingStats {
  totalCount?: number;
  outcomeDistribution?: { converted?: number; dismissed?: number; ignored?: number; delivered?: number };
}
interface QualityStats { stats?: { high: number; medium: number; low: number; rejected: number }; }
interface DriftStatus { tierAgreementRate?: number; decisionAgreementRate?: number; avgCompositeDivergence?: number; }
interface DriftAlerts { alerts?: Array<{ id: string; type: string; message: string; acknowledged: boolean; createdAt: string }>; }
interface JobsNextRun { nextRun?: string; job?: string; }
interface JobRun { id: string; job: string; status: string; startedAt: string; completedAt?: string; }
interface JobRuns { runs?: JobRun[]; }
interface Experiment {
  id: string; name: string; status: string; variantA?: string; variantB?: string;
  trafficSplit?: number; conversionA?: number; conversionB?: number; winner?: string;
}
interface Experiments { experiments?: Experiment[]; }
interface Rollout { id: string; name: string; status: string; percentage?: number; startedAt?: string; }
interface Rollouts { rollouts?: Rollout[]; }

interface InterveneTabProps {
  interventions: Intervention[]; selectedSession: string | null;
  overview: OverviewData | null; sessions: Session[];
  analyticsParams: string; webhookStats: WebhookStats | null;
  networkStatus: NetworkStatus | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString('en-US'); }
function pct(n: number | undefined | null) { return n != null ? `${(n * 100).toFixed(1)}%` : '—'; }

function statusColor(s: string) {
  const map: Record<string, string> = { converted: 'var(--accent)', delivered: 'var(--info)', dismissed: 'var(--warn)', ignored: '#8b7ea8', sent: 'var(--muted)' };
  return map[s] ?? 'var(--muted)';
}
function statusIcon(s: string) {
  return { converted: '✓', dismissed: '✕', ignored: '–', delivered: '→', sent: '·' }[s] ?? '·';
}
function typeColor(t: string) {
  const map: Record<string, string> = { passive: 'var(--tier-passive)', nudge: 'var(--tier-nudge)', active: 'var(--tier-active)', escalate: 'var(--tier-escalate)' };
  return map[(t ?? '').toLowerCase()] ?? 'var(--muted)';
}
function rolloutStatusColor(s: string) {
  const map: Record<string, string> = { rolling: 'var(--accent)', completed: 'var(--tier-monitor)', rolled_back: 'var(--tier-escalate)', paused: 'var(--warn)', pending: 'var(--muted)' };
  return map[s] ?? 'var(--muted)';
}
function jobStatusColor(s: string) { return s === 'completed' ? 'var(--accent)' : s === 'failed' ? 'var(--tier-escalate)' : 'var(--info)'; }
function formatTime(ts: number | string | undefined) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'string' ? ts : ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ─── Empty Slate ──────────────────────────────────────────────────────────────

function EmptySlate({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--muted)', gap: 8 }}>
      <span style={{ fontSize: 28, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

// ─── Intervention Row ─────────────────────────────────────────────────────────

function IntervRow({ iv, avgCartValue }: { iv: Intervention; avgCartValue: number }) {
  const [expanded, setExpanded] = useState(false);
  const status = iv.status ?? 'sent';
  const sColor = statusColor(status);
  const fId = iv.friction_id || iv.frictionId;
  const ts = iv.timestamp ?? (iv.createdAt ? new Date(iv.createdAt).getTime() : undefined);
  const revenue = iv.revenue_impact ?? (status === 'converted' ? avgCartValue : null);

  return (
    <div
      style={{ borderBottom: '1px solid rgba(26,61,74,0.4)', borderLeft: `3px solid ${sColor}44`, cursor: iv.voice_script ? 'pointer' : 'default', transition: 'background 0.15s' }}
      onClick={() => iv.voice_script && setExpanded(e => !e)}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(53,211,161,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '72px 80px 48px 1fr auto auto', gap: 10, alignItems: 'center', padding: '9px 18px', fontSize: 13 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{formatTime(ts)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: `${typeColor(iv.type ?? '')}22`, color: typeColor(iv.type ?? ''), border: `1px solid ${typeColor(iv.type ?? '')}44`, whiteSpace: 'nowrap' }}>
          {iv.type ?? 'unknown'}{iv.voice_enabled && ' 🎙'}
        </span>
        {iv.composite_score !== undefined ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', background: 'rgba(8,26,34,0.8)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 3, textAlign: 'center' }}>
            {Math.round(iv.composite_score)}
          </span>
        ) : <span />}
        <div style={{ overflow: 'hidden' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {fId && <span className="friction-tag" style={{ marginRight: 6 }}>{fId}</span>}
            {iv.session_id.slice(0, 14)}…
          </span>
        </div>
        {revenue !== null && revenue > 0 ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>+${revenue.toFixed(2)}</span>
        ) : <span />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: sColor }}>{statusIcon(status)}</span>
          <span className={`status-badge ${status}`}>{status}</span>
        </div>
      </div>
      {expanded && iv.voice_script && (
        <div style={{ padding: '8px 18px 12px 22px', background: 'rgba(6,20,30,0.5)', borderTop: '1px solid rgba(26,61,74,0.4)' }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Voice Script</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, fontStyle: 'italic', color: 'var(--muted)' }}>"{iv.voice_script}"</div>
        </div>
      )}
    </div>
  );
}

// ─── Analytics Panels ─────────────────────────────────────────────────────────

function InterventionAnalyticsPanel({
  fired, converted, dismissed, estRevenue, convRate, dismissRate, outcomes,
}: {
  fired: number; converted: number; dismissed: number; estRevenue: number | null;
  convRate: number; dismissRate: number; outcomes: Record<string, number>;
}) {
  return (
    <div className="grid-4">
      {[
        { label: 'Interventions Fired', value: fmt(fired), color: 'var(--text)', sub: 'total triggered' },
        { label: 'Converted', value: fmt(converted), color: 'var(--accent)', sub: `${pct(convRate)} rate` },
        { label: 'Dismissed', value: fmt(dismissed), color: 'var(--warn)', sub: `${pct(dismissRate)} rate` },
        { label: 'Est. Revenue Recovered', value: estRevenue !== null ? `$${estRevenue.toFixed(2)}` : '—', color: 'var(--accent)', sub: 'via conversions' },
      ].map(m => (
        <div key={m.label} className="metric-box">
          <div className="label">{m.label}</div>
          <div className="value" style={{ color: m.color }}>{m.value}</div>
          <div className="sub">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}

function VoicePanel({ voiceData }: { voiceData: VoiceData | null }) {
  if (!voiceData) return <EmptySlate icon="🎙" message="No voice data yet" />;
  return (
    <>
      <div className="grid-3" style={{ marginBottom: voiceData.breakdown ? 16 : 0 }}>
        {[
          { label: 'Voice Sessions', value: fmt(voiceData.totalSessions ?? 0), sub: 'triggered' },
          { label: 'Avg / Session', value: (voiceData.avgPerSession ?? 0).toFixed(1), sub: 'voice nudges' },
          { label: 'Conversion Rate', value: voiceData.conversionRate !== undefined ? pct(voiceData.conversionRate) : '—', sub: 'voice → purchase' },
        ].map(m => (
          <div key={m.label} className="metric-box">
            <div className="label">{m.label}</div>
            <div className="value accent">{m.value}</div>
            <div className="sub">{m.sub}</div>
          </div>
        ))}
      </div>
      {voiceData.breakdown && voiceData.breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {voiceData.breakdown.map(b => (
            <div key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ minWidth: 80, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--info)', textTransform: 'uppercase' }}>{b.type}</span>
              <div style={{ flex: 1, height: 5, background: 'rgba(8,26,34,0.6)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: b.count > 0 ? `${(b.converted / b.count) * 100}%` : '0%', height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', minWidth: 40 }}>{b.converted}/{b.count}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WebhookPanel({ webhookStats }: { webhookStats: WebhookStats | null }) {
  if (!webhookStats) return <EmptySlate icon="🔗" message="No webhook data yet" />;
  return (
    <>
      <div className="grid-3" style={{ marginBottom: webhookStats.endpoints ? 16 : 0 }}>
        {[
          { label: 'Total Delivered', value: fmt(webhookStats.totalDelivered ?? 0), color: 'var(--accent)' },
          { label: 'Failed', value: fmt(webhookStats.failed ?? 0), color: (webhookStats.failed ?? 0) > 0 ? 'var(--danger)' : 'var(--muted)' },
          { label: 'Success Rate', value: webhookStats.successRate !== undefined ? pct(webhookStats.successRate) : '—', color: (webhookStats.successRate ?? 1) < 0.9 ? 'var(--warn)' : 'var(--accent)' },
        ].map(m => (
          <div key={m.label} className="metric-box">
            <div className="label">{m.label}</div>
            <div className="value" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      {webhookStats.endpoints && webhookStats.endpoints.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {webhookStats.endpoints.map(ep => (
            <div key={ep.url} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{ep.url}</span>
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{ep.delivered} ok</span>
              {ep.failed > 0 && <span style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{ep.failed} fail</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TrainingDataPanel({ trainingStats, qualityStats }: { trainingStats: TrainingStats | null; qualityStats: QualityStats | null }) {
  if (!trainingStats) return <EmptySlate icon="📊" message="Loading training data…" />;
  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Datapoints', value: fmt(trainingStats.totalCount ?? 0) },
          { label: 'High Quality', value: qualityStats?.stats ? fmt(qualityStats.stats.high) : '—' },
          { label: 'Converted', value: fmt(trainingStats.outcomeDistribution?.converted ?? 0) },
          { label: 'Dismissed', value: fmt(trainingStats.outcomeDistribution?.dismissed ?? 0) },
        ].map(m => (
          <div key={m.label} className="metric-box">
            <div className="label">{m.label}</div>
            <div className="value">{m.value}</div>
          </div>
        ))}
      </div>
      {qualityStats?.stats && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Quality Grades</div>
          {(['high', 'medium', 'low', 'rejected'] as const).map(grade => {
            const count = qualityStats.stats![grade] ?? 0;
            const total = Object.values(qualityStats.stats!).reduce((a, b) => a + b, 0);
            const barPct = total > 0 ? (count / total) * 100 : 0;
            const color = grade === 'high' ? 'var(--accent)' : grade === 'medium' ? 'var(--info)' : grade === 'low' ? 'var(--warn)' : 'var(--tier-escalate)';
            return (
              <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ minWidth: 56, fontSize: 10, color, textTransform: 'capitalize' }}>{grade}</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(8,26,34,0.6)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', minWidth: 24, textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Export JSONL', path: '/training/export/jsonl' },
          { label: 'Export CSV', path: '/training/export/csv' },
          { label: 'Fine-Tune JSONL', path: '/training/export/fine-tune' },
        ].map(({ label, path }) => (
          <a key={path} href={`http://localhost:8080/api${path}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'var(--info)', textDecoration: 'none' }}>
            ↓ {label}
          </a>
        ))}
      </div>
    </>
  );
}

function DriftPanel({
  driftStatus, driftAlerts, loading, runDriftCheck, ackAlert,
}: {
  driftStatus: DriftStatus | null; driftAlerts: DriftAlerts | null;
  loading: string | null; runDriftCheck: () => void; ackAlert: (id: string) => void;
}) {
  const unacked = driftAlerts?.alerts?.filter(a => !a.acknowledged) ?? [];
  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Tier Agreement', value: driftStatus?.tierAgreementRate !== undefined ? pct(driftStatus.tierAgreementRate) : '—', color: (driftStatus?.tierAgreementRate ?? 1) < 0.7 ? 'var(--warn)' : 'var(--accent)', sub: 'shadow vs prod' },
          { label: 'Decision Match', value: driftStatus?.decisionAgreementRate !== undefined ? pct(driftStatus.decisionAgreementRate) : '—', color: (driftStatus?.decisionAgreementRate ?? 1) < 0.75 ? 'var(--warn)' : 'var(--accent)', sub: 'agreement' },
          { label: 'Avg Divergence', value: driftStatus?.avgCompositeDivergence !== undefined ? Math.round(driftStatus.avgCompositeDivergence).toString() : '—', color: 'var(--warn)', sub: 'composite pts' },
          { label: 'Active Alerts', value: unacked.length.toString(), color: unacked.length > 0 ? 'var(--tier-escalate)' : 'var(--accent)', sub: 'unacknowledged' },
        ].map(m => (
          <div key={m.label} className="metric-box">
            <div className="label">{m.label}</div>
            <div className="value" style={{ color: m.color }}>{m.value}</div>
            <div className="sub">{m.sub}</div>
          </div>
        ))}
      </div>
      <button onClick={runDriftCheck} disabled={loading === 'drift_check'}
        style={{ fontSize: 10, padding: '5px 14px', marginBottom: 16, background: 'rgba(53,211,161,0.1)', border: '1px solid rgba(53,211,161,0.3)', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
        {loading === 'drift_check' ? '…' : 'Run Drift Check'}
      </button>
      {unacked.length > 0 && (
        <div className="scroll-list" style={{ maxHeight: 200 }}>
          {unacked.map(alert => (
            <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(26,61,74,0.4)', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn)', minWidth: 60, flexShrink: 0 }}>{alert.type}</span>
              <span style={{ flex: 1, color: 'var(--text)' }}>{alert.message}</span>
              <button onClick={() => ackAlert(alert.id)} disabled={loading === `ack_${alert.id}`}
                style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {loading === `ack_${alert.id}` ? '…' : 'ack'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ScheduledJobsPanel({ jobsNext, jobRuns, loading, triggerJob }: { jobsNext: JobsNextRun | null; jobRuns: JobRuns | null; loading: string | null; triggerJob: (job: string) => void; }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['nightly_batch', 'drift_check', 'insight_gen'] as const).map(job => (
          <button key={job} onClick={() => triggerJob(job)} disabled={!!loading}
            style={{ fontSize: 10, padding: '4px 12px', background: 'rgba(89,184,230,0.1)', border: '1px solid rgba(89,184,230,0.3)', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--info)', fontFamily: 'var(--font-mono)' }}>
            {loading === `job_${job}` ? '…' : `▶ ${(job ?? '').replace(/_/g, ' ')}`}
          </button>
        ))}
      </div>
      {jobsNext && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
          Next run: {jobsNext.nextRun ?? '—'}
          {jobsNext.job && <span style={{ marginLeft: 8, color: 'var(--info)' }}>{jobsNext.job}</span>}
        </div>
      )}
      {jobRuns?.runs && jobRuns.runs.length > 0 && (
        <div className="scroll-list" style={{ maxHeight: 200 }}>
          {jobRuns.runs.map(run => (
            <div key={run.id} style={{ display: 'grid', gridTemplateColumns: '120px 80px 1fr', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(26,61,74,0.3)', fontSize: 11 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--info)' }}>{run.job}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: jobStatusColor(run.status) }}>{run.status}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{new Date(run.startedAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function NetworkPanel({ networkStatus }: { networkStatus: NetworkStatus | null }) {
  if (!networkStatus) return <EmptySlate icon="🌐" message="Network data loading…" />;
  return (
    <div className="grid-2">
      {[
        { label: 'Contribution Sessions', value: fmt(networkStatus.site?.contributionSessions ?? networkStatus.contributionSessions ?? 0), sub: (networkStatus.site?.contributionSessions ?? 0) < 50 ? '< 50 sessions' : 'site data sufficient' },
        { label: 'Network Patterns', value: fmt(networkStatus.totalPatterns ?? 0), sub: 'cross-merchant' },
      ].map(m => (
        <div key={m.label} className="metric-box">
          <div className="label">{m.label}</div>
          <div className="value" style={{ fontSize: 16 }}>{m.value}</div>
          <div className="sub">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}

const INTERVENE_TABS = [
  { id: 'analytics',    label: 'Intervention Analytics' },
  { id: 'voice',        label: 'Voice' },
  { id: 'webhooks',     label: 'Webhook Deliveries' },
  { id: 'training',     label: 'Training Data' },
  { id: 'drift',        label: 'Drift Detection' },
  { id: 'jobs',         label: 'Scheduled Jobs' },
  { id: 'network',      label: 'Network Learning' },
] as const;
type InterveneAnalyticsTab = typeof INTERVENE_TABS[number]['id'];

// ─── Main Component ───────────────────────────────────────────────────────────

export function InterveneTab({
  interventions, selectedSession, overview,
  sessions, analyticsParams, webhookStats, networkStatus,
}: InterveneTabProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<InterveneAnalyticsTab>('analytics');

  const { data: voiceData }                        = useApi<VoiceData>(`/analytics/voice${analyticsParams}`, { pollMs: 20_000 });
  const { data: trainingStats }                    = useApi<TrainingStats>('/training/stats', { pollMs: 30_000 });
  const { data: qualityStats }                     = useApi<QualityStats>('/training/quality/stats', { pollMs: 30_000 });
  const { data: driftStatus, reload: reloadDrift } = useApi<DriftStatus>('/drift/status', { pollMs: 15_000 });
  const { data: driftAlerts, reload: reloadAlerts }= useApi<DriftAlerts>('/drift/alerts?limit=20', { pollMs: 15_000 });
  const { data: jobsNext }                         = useApi<JobsNextRun>('/jobs/next-run', { pollMs: 30_000 });
  const { data: jobRuns, reload: reloadRuns }      = useApi<JobRuns>('/jobs/runs?limit=10', { pollMs: 15_000 });
  const { data: experiments, reload: reloadExps }  = useApi<Experiments>('/experiments?limit=20', { pollMs: 20_000 });
  const { data: rollouts, reload: reloadRollouts } = useApi<Rollouts>('/rollouts?limit=10', { pollMs: 20_000 });

  const filtered = useMemo(() =>
    selectedSession ? interventions.filter(i => i.session_id === selectedSession) : interventions,
    [interventions, selectedSession]
  );

  const outcomes = useMemo(() => {
    const c = { converted: 0, delivered: 0, dismissed: 0, ignored: 0, sent: 0 };
    for (const iv of filtered) { const s = iv.status ?? 'sent'; if (s in c) c[s as keyof typeof c]++; }
    return c;
  }, [filtered]);

  const eff = overview?.interventionEfficiency;
  const fired = eff?.fired ?? Object.values(outcomes).reduce((a, b) => a + b, 0);
  const converted = eff?.converted ?? outcomes.converted;
  const convRate = eff?.conversionRate ?? (fired > 0 ? converted / fired : 0);
  const dismissRate = eff?.dismissalRate ?? (fired > 0 ? outcomes.dismissed / fired : 0);

  const avgCartValue = useMemo(() => {
    const withCart = sessions.filter(s => s.cartValue > 0);
    return withCart.length > 0 ? withCart.reduce((s, sess) => s + sess.cartValue, 0) / withCart.length : 0;
  }, [sessions]);

  const estRevenue = converted > 0 && avgCartValue > 0
    ? converted * avgCartValue
    : overview?.interventionEfficiency?.totalAttributedRevenue ?? null;

  const triggerJob = useCallback(async (job: string) => {
    setLoading(`job_${job}`);
    try { await apiFetch('/jobs/trigger', { method: 'POST', body: JSON.stringify({ job }), headers: { 'Content-Type': 'application/json' } }); reloadRuns(); }
    finally { setLoading(null); }
  }, [reloadRuns]);

  const ackAlert = useCallback(async (id: string) => {
    setLoading(`ack_${id}`);
    try { await apiFetch(`/drift/alerts/${id}/ack`, { method: 'POST' }); reloadAlerts(); }
    finally { setLoading(null); }
  }, [reloadAlerts]);

  const runDriftCheck = useCallback(async () => {
    setLoading('drift_check');
    try { await apiFetch('/drift/check', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } }); reloadDrift(); reloadAlerts(); }
    finally { setLoading(null); }
  }, [reloadDrift, reloadAlerts]);

  const expAction = useCallback(async (id: string, action: string) => {
    setLoading(`exp_${id}_${action}`);
    try { await apiFetch(`/experiments/${id}/${action}`, { method: 'POST' }); reloadExps(); }
    finally { setLoading(null); }
  }, [reloadExps]);

  const rolloutAction = useCallback(async (id: string, action: string) => {
    setLoading(`rollout_${id}_${action}`);
    try { await apiFetch(`/rollouts/${id}/${action}`, { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } }); reloadRollouts(); }
    finally { setLoading(null); }
  }, [reloadRollouts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── HERO: Intervention Feed ────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: '58vh', minHeight: 280, display: 'flex', flexDirection: 'column', padding: '14px 20px 0', background: 'var(--bg)' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(53,211,161,0.1)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}>
              Intervention Feed
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(53,211,161,0.1)', border: '1px solid rgba(53,211,161,0.3)', borderRadius: 6, padding: '3px 10px' }}>
              <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>✓ {pct(convRate)} conversion</span>
            </div>
            <div style={{ flex: 1, maxWidth: 220 }}>
              {fired > 0 && (
                <div className="outcome-bar">
                  {(['converted', 'delivered', 'dismissed', 'ignored'] as const).map(s => (
                    <div key={s} className={`seg ${s}`} style={{ width: `${fired > 0 ? ((outcomes[s] / fired) * 100).toFixed(1) : 0}%` }} title={`${s}: ${outcomes[s]}`} />
                  ))}
                </div>
              )}
            </div>
            {estRevenue !== null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginLeft: 'auto' }}>
                ${estRevenue.toFixed(2)} recovered
              </span>
            )}
          </div>

          {/* Column labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 80px 48px 1fr auto auto', gap: 10, padding: '5px 18px', borderBottom: '1px solid var(--line)', background: 'rgba(8,26,34,0.4)', flexShrink: 0 }}>
            {['Time', 'Type', 'Score', 'Session', 'Revenue', 'Outcome'].map(h => (
              <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>

          {/* Feed */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⚡</div>
                <p>No interventions yet</p>
                <p className="muted">Interventions fire when MSWIM reaches NUDGE or above.</p>
              </div>
            ) : filtered.map((iv, i) => (
              <IntervRow key={iv.intervention_id ?? i} iv={iv} avgCartValue={avgCartValue} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Analytics Tab Strip ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 20px' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0, overflowX: 'auto' }}>
            {INTERVENE_TABS.map(tab => {
              const active = analyticsTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setAnalyticsTab(tab.id)}
                  style={{ padding: '9px 14px', fontSize: 10, fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : 'var(--muted)', background: 'transparent', border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'color 0.15s', marginBottom: -1, whiteSpace: 'nowrap' }}>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px' }}>
            {analyticsTab === 'analytics' && (
              <InterventionAnalyticsPanel fired={fired} converted={converted} dismissed={outcomes.dismissed} estRevenue={estRevenue} convRate={convRate} dismissRate={dismissRate} outcomes={outcomes} />
            )}
            {analyticsTab === 'voice'    && <VoicePanel voiceData={voiceData ?? null} />}
            {analyticsTab === 'webhooks' && <WebhookPanel webhookStats={webhookStats} />}
            {analyticsTab === 'training' && <TrainingDataPanel trainingStats={trainingStats ?? null} qualityStats={qualityStats ?? null} />}
            {analyticsTab === 'drift'    && <DriftPanel driftStatus={driftStatus ?? null} driftAlerts={driftAlerts ?? null} loading={loading} runDriftCheck={runDriftCheck} ackAlert={ackAlert} />}
            {analyticsTab === 'jobs'     && <ScheduledJobsPanel jobsNext={jobsNext ?? null} jobRuns={jobRuns ?? null} loading={loading} triggerJob={triggerJob} />}
            {analyticsTab === 'network'  && <NetworkPanel networkStatus={networkStatus} />}
          </div>
        </div>
      </div>

    </div>
  );
}
