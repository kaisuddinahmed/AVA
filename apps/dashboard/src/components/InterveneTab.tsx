import { useState, useMemo, useCallback, useEffect, type CSSProperties } from 'react';
import { useApi, apiFetch } from '../hooks/use-api';
import { classifyConfidence, type ConfidenceTier } from '../lib/confidence-tier';
import { CoachingConfigPanel } from './CoachingConfigPanel';

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
  /** Phase 3.3 — site URL used by ApprovalsPanel for the recommendations API. */
  activeSiteUrl?: string;
}

// ─── Recommendation (Phase 3.2/3.3) ───────────────────────────────────────────

interface Recommendation {
  id: string;
  siteUrl: string;
  frictionId: string;
  interventionType: string;
  actionCode: string;
  payloadTemplate: string;
  rationale: string;
  expectedLiftPct: number;
  confidence: number;
  sampleSizeBasis: number;
  status: 'pending' | 'approved' | 'active' | 'rejected' | 'archived';
  approvedExperimentId?: string | null;
  createdAt?: string;
}
interface RecommendationsResponse { recommendations: Recommendation[]; count: number; }

interface RecommendationOutcomeSnapshot {
  id: string;
  recommendationId: string;
  experimentId: string;
  windowStart: string;
  windowEnd: string;
  variantSessions: number;
  controlSessions: number;
  variantConversions: number;
  controlConversions: number;
  conversionDeltaPct: number;
  attributedRevenue: number;
  pValue?: number | null;
  decision?: 'ship' | 'rollback' | 'extend' | 'inconclusive' | null;
  decidedAt?: string | null;
  createdAt: string;
}
type LiveResultRow = Recommendation & { latestOutcome: RecommendationOutcomeSnapshot | null };
interface OutcomeSummaryResponse { recommendations: LiveResultRow[]; count: number; }

// Phase 3.6 — Weekly Digest preview shape (mirrors weekly-digest.service.ts).
interface DigestFrictionRow {
  frictionId: string; total: number; converted: number; dismissed: number; ignored: number;
  conversionRate: number; dismissalRate: number;
}
interface WeeklyDigestData {
  siteUrl: string;
  period: { start: string; end: string; days: number };
  traffic: { sessions: number; sessionsPrior: number; wowDeltaPct: number | null };
  recommendations: { approvedThisWeek: number; rejectedThisWeek: number; pendingNow: number; activeNow: number };
  outcomes: {
    snapshotsThisWeek: number;
    decisions: { ship: number; rollback: number; extend: number; inconclusive: number; total: number };
    attributedRevenue: number;
  };
  topFrictions: DigestFrictionRow[];
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

function actionBtn(color: string): CSSProperties {
  return {
    fontSize: 9,
    padding: '3px 9px',
    background: `${color}1a`,
    border: `1px solid ${color}55`,
    borderRadius: 3,
    cursor: 'pointer',
    color,
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
}

function ExperimentsPanel({
  experiments, loading, expAction,
}: {
  experiments: Experiments | null;
  loading: string | null;
  expAction: (id: string, action: string) => void;
}) {
  const list = (experiments?.experiments ?? []) as Array<Experiment & Record<string, unknown>>;
  if (list.length === 0) return <EmptySlate icon="🧪" message="No experiments yet" />;
  return (
    <div className="scroll-list" style={{ maxHeight: 360 }}>
      {list.map(exp => {
        const trafficPct = (exp as { trafficPercent?: number }).trafficPercent ?? exp.trafficSplit;
        const metric = (exp as { primaryMetric?: string }).primaryMetric;
        const isRunning = exp.status === 'running';
        const statusBg = isRunning ? 'rgba(53,211,161,0.18)' : 'rgba(255,255,255,0.06)';
        const statusFg = isRunning ? 'var(--accent)' : 'var(--muted)';
        return (
          <div key={exp.id} style={{ padding: '9px 0', borderBottom: '1px solid rgba(26,61,74,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{exp.name}</span>
              {exp.winner && <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>winner: {exp.winner}</span>}
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: statusBg, color: statusFg, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{exp.status}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              {trafficPct != null && <>Traffic: {trafficPct}%</>}
              {metric && <> · Metric: {metric}</>}
              {exp.variantA && exp.variantB && <> · {exp.variantA} vs {exp.variantB}</>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {exp.status === 'draft' && (
                <button onClick={() => expAction(exp.id, 'start')} disabled={!!loading} style={actionBtn('var(--accent)')}>Start</button>
              )}
              {exp.status === 'running' && (
                <>
                  <button onClick={() => expAction(exp.id, 'pause')} disabled={!!loading} style={actionBtn('var(--warn)')}>Pause</button>
                  <button onClick={() => expAction(exp.id, 'end')} disabled={!!loading} style={actionBtn('var(--muted)')}>End</button>
                </>
              )}
              {exp.status === 'paused' && (
                <button onClick={() => expAction(exp.id, 'start')} disabled={!!loading} style={actionBtn('var(--accent)')}>Resume</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RolloutsPanel({
  rollouts, loading, rolloutAction,
}: {
  rollouts: Rollouts | null;
  loading: string | null;
  rolloutAction: (id: string, action: string) => void;
}) {
  const list = (rollouts?.rollouts ?? []) as Array<Rollout & Record<string, unknown>>;
  if (list.length === 0) return <EmptySlate icon="🚦" message="No rollouts yet" />;
  return (
    <div className="scroll-list" style={{ maxHeight: 360 }}>
      {list.map(r => {
        const color = rolloutStatusColor(r.status);
        const stage = (r as { currentStage?: number }).currentStage;
        const changeType = (r as { changeType?: string }).changeType;
        const health = (r as { lastHealthStatus?: string }).lastHealthStatus;
        return (
          <div key={r.id} style={{ padding: '9px 0', borderBottom: '1px solid rgba(26,61,74,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{r.name}</span>
              {r.percentage != null && <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{r.percentage}%</span>}
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: `${color}22`, color, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{r.status}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              {stage != null && <>Stage {stage + 1}</>}
              {changeType && <> · {changeType}</>}
              {health && <> · health: {health}</>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {r.status === 'pending' && (
                <button onClick={() => rolloutAction(r.id, 'start')} disabled={!!loading} style={actionBtn('var(--accent)')}>Start</button>
              )}
              {r.status === 'rolling' && (
                <>
                  <button onClick={() => rolloutAction(r.id, 'promote')} disabled={!!loading} style={actionBtn('var(--accent)')}>Promote</button>
                  <button onClick={() => rolloutAction(r.id, 'pause')} disabled={!!loading} style={actionBtn('var(--warn)')}>Pause</button>
                  <button onClick={() => rolloutAction(r.id, 'rollback')} disabled={!!loading} style={actionBtn('var(--tier-escalate)')}>Rollback</button>
                </>
              )}
              {r.status === 'paused' && (
                <>
                  <button onClick={() => rolloutAction(r.id, 'start')} disabled={!!loading} style={actionBtn('var(--accent)')}>Resume</button>
                  <button onClick={() => rolloutAction(r.id, 'rollback')} disabled={!!loading} style={actionBtn('var(--tier-escalate)')}>Rollback</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
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

// ─── Freshness badge (Phase 3.5) ──────────────────────────────────────────────

function UpdatedAgo({ ts }: { ts: number | null }) {
  // Tick once a second so the relative label stays current.
  const [, force] = useState(0);
  useEffect(() => {
    if (!ts) return;
    const id = setInterval(() => force(n => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [ts]);
  if (!ts) return null;
  const ageS = Math.max(0, Math.round((Date.now() - ts) / 1000));
  const label = ageS < 5 ? 'just now' : ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago`;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)',
      padding: '2px 7px', border: '1px solid var(--line)', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      ↻ {label}
    </span>
  );
}

// ─── Confidence chip (Codex review — rules-based vs learned) ─────────────────
// Helper extracted to apps/dashboard/src/lib/confidence-tier.ts so the
// classification logic is unit-testable without React/DOM.

function ConfidenceChip({ tier }: { tier: ConfidenceTier }) {
  const palette: Record<ConfidenceTier, { fg: string; bg: string; label: string; icon: string; title: string }> = {
    rules: {
      fg: "var(--warn)",
      bg: "rgba(230,184,0,0.14)",
      label: "rules-based",
      icon: "🧪",
      title: "Low-sample fallback. Generated from the F-code playbook lookup rather than learned outcomes. Confidence will rise as more sessions accrue.",
    },
    learning: {
      fg: "var(--info)",
      bg: "rgba(89,184,230,0.14)",
      label: "learning",
      icon: "📊",
      title: "Mid-sample. The engine has enough signal to rank but not enough for statistical significance yet. Keep the experiment running.",
    },
    learned: {
      fg: "var(--accent)",
      bg: "rgba(53,211,161,0.18)",
      label: "learned",
      icon: "✓",
      title: "High-sample, statistically significant outcome. The engine learned this from real conversions on your store.",
    },
  };
  const p = palette[tier];
  return (
    <span
      title={p.title}
      style={{
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: 3,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.fg}33`,
        textTransform: "uppercase",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.05em",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {p.icon} {p.label}
    </span>
  );
}

// ─── Approvals Panel (Phase 3.3 — INTERVENE control-room cards) ──────────────

function ApprovalCard({
  rec,
  loading,
  onApprove,
  onReject,
}: {
  rec: Recommendation;
  loading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const liftColor = rec.expectedLiftPct >= 40 ? 'var(--accent)' : 'var(--info)';
  const confColor = rec.confidence >= 0.7 ? 'var(--accent)' : rec.confidence >= 0.4 ? 'var(--info)' : 'var(--muted)';
  const isLoading = loading === `approve_${rec.id}` || loading === `reject_${rec.id}`;

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid rgba(26,61,74,0.4)',
      borderLeft: `3px solid ${liftColor}`,
      background: expanded ? 'rgba(53,211,161,0.03)' : 'transparent',
      transition: 'background 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span className="friction-tag">{rec.frictionId}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
          {rec.actionCode}
        </span>
        <span style={{
          fontSize: 9, padding: '2px 7px', borderRadius: 3,
          background: `${typeColor(rec.interventionType)}22`,
          color: typeColor(rec.interventionType),
          border: `1px solid ${typeColor(rec.interventionType)}44`,
          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
        }}>{rec.interventionType}</span>
        <ConfidenceChip tier={classifyConfidence(rec)} />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: liftColor, fontWeight: 700 }}>
          +{rec.expectedLiftPct.toFixed(0)}% lift
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: confColor }}>
          {(rec.confidence * 100).toFixed(0)}% conf
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
          n={rec.sampleSizeBasis}
        </span>
      </div>

      {/* Rationale */}
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 8 }}>
        {rec.rationale}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {!rejecting ? (
          <>
            <button
              onClick={() => onApprove(rec.id)}
              disabled={isLoading}
              style={actionBtn('var(--accent)')}
            >
              {loading === `approve_${rec.id}` ? '…' : '✓ Approve & launch'}
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={isLoading}
              style={actionBtn('var(--warn)')}
            >
              ✕ Reject
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ ...actionBtn('var(--muted)'), marginLeft: 'auto' }}
            >
              {expanded ? '— payload' : '+ payload'}
            </button>
          </>
        ) : (
          <>
            <input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why not? (logged for tuning)"
              style={{
                flex: 1, fontSize: 11, padding: '4px 8px',
                background: 'rgba(8,26,34,0.6)', border: '1px solid var(--line)',
                borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--font-mono)',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && reason.trim()) {
                  onReject(rec.id, reason.trim());
                  setRejecting(false); setReason('');
                } else if (e.key === 'Escape') {
                  setRejecting(false); setReason('');
                }
              }}
            />
            <button
              onClick={() => { if (reason.trim()) { onReject(rec.id, reason.trim()); setRejecting(false); setReason(''); } }}
              disabled={!reason.trim() || isLoading}
              style={actionBtn('var(--warn)')}
            >
              {loading === `reject_${rec.id}` ? '…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setRejecting(false); setReason(''); }}
              style={actionBtn('var(--muted)')}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Payload preview */}
      {expanded && (
        <pre style={{
          marginTop: 8, padding: '8px 10px',
          background: 'rgba(6,20,30,0.7)', border: '1px solid rgba(26,61,74,0.4)',
          borderRadius: 3, fontSize: 10, color: 'var(--muted)',
          fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 200, overflowY: 'auto',
        }}>{(() => {
          try { return JSON.stringify(JSON.parse(rec.payloadTemplate), null, 2); }
          catch { return rec.payloadTemplate; }
        })()}</pre>
      )}
    </div>
  );
}

function ApprovalsPanel({
  siteUrl,
  recommendations,
  loading,
  lastUpdatedAt,
  onApprove,
  onReject,
  onRegenerate,
}: {
  siteUrl: string | undefined;
  recommendations: Recommendation[] | null;
  loading: string | null;
  lastUpdatedAt: number | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRegenerate: () => void;
}) {
  if (!siteUrl) return <EmptySlate icon="⚡" message="Activate a site to see recommendations" />;
  const recs = recommendations ?? [];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>
          AVA noticed these frictions and is recommending actions.
          Approve to launch an experiment; reject to retrain the engine.
        </div>
        <UpdatedAgo ts={lastUpdatedAt} />
        <button
          onClick={onRegenerate}
          disabled={loading === 'regenerate'}
          style={actionBtn('var(--info)')}
        >
          {loading === 'regenerate' ? '…' : '↻ Regenerate'}
        </button>
      </div>
      {recs.length === 0 ? (
        <EmptySlate icon="✓" message="Inbox zero — no pending recommendations" />
      ) : (
        <div className="scroll-list" style={{ maxHeight: 600 }}>
          {recs.map(r => (
            <ApprovalCard
              key={r.id}
              rec={r}
              loading={loading}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Live Results Panel (Phase 3.4 — revenue attribution + decision pills) ──

function decisionPillStyle(decision: string | null | undefined): CSSProperties {
  const map: Record<string, { fg: string; bg: string }> = {
    ship:         { fg: 'var(--accent)',        bg: 'rgba(53,211,161,0.18)' },
    rollback:     { fg: 'var(--tier-escalate)', bg: 'rgba(228,87,87,0.18)' },
    extend:       { fg: 'var(--info)',          bg: 'rgba(89,184,230,0.18)' },
    inconclusive: { fg: 'var(--muted)',         bg: 'rgba(255,255,255,0.06)' },
  };
  const c = map[decision ?? 'inconclusive'] ?? map.inconclusive!;
  return {
    fontSize: 9, padding: '2px 7px', borderRadius: 3,
    background: c.bg, color: c.fg,
    textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
    fontWeight: 700,
  };
}

function LiveResultRow({ row, loading, onRecompute }: { row: LiveResultRow; loading: string | null; onRecompute: (id: string) => void }) {
  const out = row.latestOutcome;
  const recomputing = loading === `compute_${row.id}`;
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(26,61,74,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span className="friction-tag">{row.frictionId}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
          {row.actionCode}
        </span>
        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          {row.status}
        </span>
        <ConfidenceChip
          tier={classifyConfidence(
            { confidence: row.confidence, sampleSizeBasis: row.sampleSizeBasis },
            out
              ? {
                  significant: (out.pValue != null && out.pValue < 0.05) ? true : false,
                  variantSessions: out.variantSessions,
                  controlSessions: out.controlSessions,
                }
              : null,
          )}
        />
        {out?.decision && <span style={decisionPillStyle(out.decision)}>{out.decision}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => onRecompute(row.id)} disabled={recomputing} style={actionBtn('var(--info)')}>
          {recomputing ? '…' : '↻ Recompute'}
        </button>
      </div>
      {out ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 11 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attributed revenue</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
              ${out.attributedRevenue.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CR delta</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: out.conversionDeltaPct > 0 ? 'var(--accent)' : 'var(--tier-escalate)', fontWeight: 700 }}>
              {out.conversionDeltaPct > 0 ? '+' : ''}{out.conversionDeltaPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Treatment / control</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
              {out.variantConversions}/{out.variantSessions} · {out.controlConversions}/{out.controlSessions}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>p-value</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
              {out.pValue != null ? out.pValue.toFixed(4) : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          No outcome computed yet — click Recompute to snapshot now.
        </div>
      )}
    </div>
  );
}

function LiveResultsPanel({
  siteUrl,
  rows,
  loading,
  lastUpdatedAt,
  onRecompute,
}: {
  siteUrl: string | undefined;
  rows: LiveResultRow[] | null;
  loading: string | null;
  lastUpdatedAt: number | null;
  onRecompute: (id: string) => void;
}) {
  if (!siteUrl) return null;
  const list = rows ?? [];
  // Total attributed revenue across all approved/active recs with outcomes.
  const totalRevenue = list.reduce((sum, r) => sum + (r.latestOutcome?.attributedRevenue ?? 0), 0);

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(8,26,34,0.4)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text)' }}>
          Live results
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{list.length} approved · ${totalRevenue.toFixed(2)} attributed</span>
        <div style={{ flex: 1 }} />
        <UpdatedAgo ts={lastUpdatedAt} />
      </div>
      {list.length === 0 ? (
        <EmptySlate icon="📊" message="Approve a recommendation to see live results here" />
      ) : (
        <div className="scroll-list" style={{ maxHeight: 400 }}>
          {list.map(r => <LiveResultRow key={r.id} row={r} loading={loading} onRecompute={onRecompute} />)}
        </div>
      )}
    </div>
  );
}

// ─── Weekly Digest panel (Phase 3.6) ──────────────────────────────────────────

function DigestPanel({
  siteUrl,
  digest,
  lastUpdatedAt,
}: {
  siteUrl: string | undefined;
  digest: WeeklyDigestData | null;
  lastUpdatedAt: number | null;
}) {
  if (!siteUrl) return <EmptySlate icon="📰" message="Activate a site to see the weekly digest" />;
  if (!digest) return <EmptySlate icon="📰" message="Building digest…" />;

  const wow = digest.traffic.wowDeltaPct;
  const wowColor = wow === null ? 'var(--muted)' : wow >= 0 ? 'var(--accent)' : 'var(--tier-escalate)';
  const wowLabel = wow === null ? '—' : `${wow >= 0 ? '+' : ''}${wow.toFixed(1)}%`;
  const periodStart = new Date(digest.period.start);
  const periodEnd = new Date(digest.period.end);
  const fmtDate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Weekly digest · {fmtDate(periodStart)} → {fmtDate(periodEnd)} ({digest.period.days}d)
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
            ${digest.outcomes.attributedRevenue.toFixed(2)} attributed · {digest.outcomes.decisions.ship} shipped wins · {digest.recommendations.pendingNow} awaiting your review
          </div>
        </div>
        <UpdatedAgo ts={lastUpdatedAt} />
      </div>

      {/* Traffic + revenue */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="metric-box">
          <div className="label">Sessions</div>
          <div className="value">{fmt(digest.traffic.sessions)}</div>
          <div className="sub">vs {fmt(digest.traffic.sessionsPrior)} prior</div>
        </div>
        <div className="metric-box">
          <div className="label">WoW change</div>
          <div className="value" style={{ color: wowColor }}>{wowLabel}</div>
          <div className="sub">prior 7d baseline</div>
        </div>
        <div className="metric-box">
          <div className="label">Attributed revenue</div>
          <div className="value accent">${digest.outcomes.attributedRevenue.toFixed(2)}</div>
          <div className="sub">from {digest.outcomes.snapshotsThisWeek} outcome snapshots</div>
        </div>
        <div className="metric-box">
          <div className="label">Pending review</div>
          <div className="value" style={{ color: digest.recommendations.pendingNow > 0 ? 'var(--warn)' : 'var(--accent)' }}>
            {digest.recommendations.pendingNow}
          </div>
          <div className="sub">approve in queue above</div>
        </div>
      </div>

      {/* Decision tally */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Outcomes this week
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={decisionPillStyle('ship')}>{digest.outcomes.decisions.ship} ship</span>
          <span style={decisionPillStyle('rollback')}>{digest.outcomes.decisions.rollback} rollback</span>
          <span style={decisionPillStyle('extend')}>{digest.outcomes.decisions.extend} extend</span>
          <span style={decisionPillStyle('inconclusive')}>{digest.outcomes.decisions.inconclusive} inconclusive</span>
        </div>
      </div>

      {/* Recommendations status */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Recommendations
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)', display: 'flex', gap: 18, fontFamily: 'var(--font-mono)' }}>
          <span>✓ {digest.recommendations.approvedThisWeek} approved</span>
          <span style={{ color: 'var(--warn)' }}>✕ {digest.recommendations.rejectedThisWeek} rejected</span>
          <span style={{ color: 'var(--info)' }}>↻ {digest.recommendations.activeNow} active</span>
          <span style={{ color: 'var(--muted)' }}>{digest.recommendations.pendingNow} pending</span>
        </div>
      </div>

      {/* Top frictions */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Top frictions by firings
        </div>
        {digest.topFrictions.length === 0 ? (
          <EmptySlate icon="🎯" message="No intervention firings in this window" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {digest.topFrictions.map(f => (
              <div key={f.frictionId} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 70px 70px', gap: 10, alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(26,61,74,0.3)' }}>
                <span className="friction-tag">{f.frictionId}</span>
                <div style={{ height: 6, background: 'rgba(8,26,34,0.6)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (f.total / Math.max(1, digest.topFrictions[0]!.total)) * 100)}%`, height: '100%', background: 'var(--info)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>n={f.total}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>{pct(f.conversionRate)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn)' }}>{pct(f.dismissalRate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const INTERVENE_TABS = [
  { id: 'approvals',    label: 'Approvals' },
  { id: 'coaching',     label: 'Coaching' }, // Thinking Layer step 9 (2026-05-19)
  { id: 'digest',       label: 'Weekly Digest' },
  { id: 'analytics',    label: 'Intervention Analytics' },
  { id: 'voice',        label: 'Voice' },
  { id: 'webhooks',     label: 'Webhook Deliveries' },
  { id: 'experiments',  label: 'A/B Experiments' },
  { id: 'rollouts',     label: 'Gradual Rollouts' },
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
  activeSiteUrl,
}: InterveneTabProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<InterveneAnalyticsTab>('approvals');

  // Recommendations queue (Phase 3.3) — pending only, polled every 15s
  const recsPath = activeSiteUrl
    ? `/recommendations?siteUrl=${encodeURIComponent(activeSiteUrl)}&status=pending`
    : null;
  const { data: recommendationsData, reload: reloadRecs, lastUpdatedAt: recsUpdatedAt } = useApi<RecommendationsResponse>(recsPath, { pollMs: 15_000 });

  // Live results — approved/active recs with their latest outcome.
  const outcomesSummaryPath = activeSiteUrl
    ? `/recommendations/outcomes/summary?siteUrl=${encodeURIComponent(activeSiteUrl)}`
    : null;
  const { data: outcomeSummary, reload: reloadOutcomes, lastUpdatedAt: outcomesUpdatedAt } = useApi<OutcomeSummaryResponse>(outcomesSummaryPath, { pollMs: 20_000 });

  // Phase 3.6 — weekly digest preview (composed server-side from real data).
  const digestPath = activeSiteUrl
    ? `/insights/digest?siteUrl=${encodeURIComponent(activeSiteUrl)}`
    : null;
  const { data: digest, lastUpdatedAt: digestUpdatedAt } = useApi<WeeklyDigestData>(digestPath, { pollMs: 60_000 });

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

  // Approving / rejecting changes BOTH the pending queue AND the live-results
  // summary (the newly-approved rec appears there). Cross-link the reloads so
  // the UI stays consistent without waiting for the next poll tick.
  const approveRec = useCallback(async (id: string) => {
    setLoading(`approve_${id}`);
    try {
      await apiFetch(`/recommendations/${id}/approve`, { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
      reloadRecs();
      reloadOutcomes();
    }
    finally { setLoading(null); }
  }, [reloadRecs, reloadOutcomes]);

  const rejectRec = useCallback(async (id: string, reason: string) => {
    setLoading(`reject_${id}`);
    try { await apiFetch(`/recommendations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }), headers: { 'Content-Type': 'application/json' } }); reloadRecs(); }
    finally { setLoading(null); }
  }, [reloadRecs]);

  const regenerateRecs = useCallback(async () => {
    if (!activeSiteUrl) return;
    setLoading('regenerate');
    try { await apiFetch('/recommendations/regenerate', { method: 'POST', body: JSON.stringify({ siteUrl: activeSiteUrl }), headers: { 'Content-Type': 'application/json' } }); reloadRecs(); }
    finally { setLoading(null); }
  }, [activeSiteUrl, reloadRecs]);

  const recomputeOutcome = useCallback(async (id: string) => {
    setLoading(`compute_${id}`);
    try {
      // Recompute can flip a rec to ship/rollback decision; reload both panels.
      await apiFetch(`/recommendations/${id}/compute-outcome`, { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
      reloadOutcomes();
      reloadRecs();
    }
    finally { setLoading(null); }
  }, [reloadOutcomes, reloadRecs]);

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
            {analyticsTab === 'approvals' && (
              <>
                <ApprovalsPanel
                  siteUrl={activeSiteUrl}
                  recommendations={recommendationsData?.recommendations ?? null}
                  loading={loading}
                  lastUpdatedAt={recsUpdatedAt}
                  onApprove={approveRec}
                  onReject={rejectRec}
                  onRegenerate={regenerateRecs}
                />
                <LiveResultsPanel
                  siteUrl={activeSiteUrl}
                  rows={outcomeSummary?.recommendations ?? null}
                  loading={loading}
                  lastUpdatedAt={outcomesUpdatedAt}
                  onRecompute={recomputeOutcome}
                />
              </>
            )}
            {analyticsTab === 'coaching' && (
              <CoachingConfigPanel siteUrl={activeSiteUrl ?? null} />
            )}
            {analyticsTab === 'digest' && (
              <DigestPanel siteUrl={activeSiteUrl} digest={digest ?? null} lastUpdatedAt={digestUpdatedAt} />
            )}
            {analyticsTab === 'analytics' && (
              <InterventionAnalyticsPanel fired={fired} converted={converted} dismissed={outcomes.dismissed} estRevenue={estRevenue} convRate={convRate} dismissRate={dismissRate} outcomes={outcomes} />
            )}
            {analyticsTab === 'voice'    && <VoicePanel voiceData={voiceData ?? null} />}
            {analyticsTab === 'webhooks' && <WebhookPanel webhookStats={webhookStats} />}
            {analyticsTab === 'experiments' && <ExperimentsPanel experiments={experiments ?? null} loading={loading} expAction={expAction} />}
            {analyticsTab === 'rollouts' && <RolloutsPanel rollouts={rollouts ?? null} loading={loading} rolloutAction={rolloutAction} />}
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
