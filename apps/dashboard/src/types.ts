/* ──────────────────────────────────────────────────────────────
   Dashboard-local type definitions.
   Mirrors server broadcast shapes so we stay decoupled from
   @ava/shared (which is TS-only, not bundled for the browser).
   ────────────────────────────────────────────────────────────── */

// ── Track Events ─────────────────────────────────────────────
// Server broadcasts NormalizedEvent shape: camelCase fields
export interface TrackEventData {
  id: string;
  session_id?: string;
  category: string;
  eventType: string;
  frictionId?: string;
  pageType?: string;
  pageUrl?: string;
  rawSignals: string;
  timestamp: number | string;
  // Also accept snake_case variants for flexibility
  event_type?: string;
  friction_id?: string | null;
}

// ── MSWIM Signals ────────────────────────────────────────────
export interface MSWIMSignals {
  intent: number;
  friction: number;
  clarity: number;
  receptivity: number;
  value: number;
}

export interface MSWIMResult {
  signals: MSWIMSignals;
  weights_used: Record<string, number>;
  composite_score: number;
  tier: ScoreTier;
  gate_override: string | null;
  decision: "fire" | "suppress" | "queue";
  reasoning: string;
}

export type ScoreTier = "MONITOR" | "PASSIVE" | "NUDGE" | "ACTIVE" | "ESCALATE";

// ── Friction Detection ───────────────────────────────────────
export interface FrictionDetection {
  friction_id: string;
  category: string;
  confidence: number;
  evidence: string[];
  source: "llm" | "rule" | "hybrid";
}

// ── Behavior Pattern Detection ───────────────────────────────
export type BehaviorGroup = "HIGH_INTENT" | "COMPARISON" | "HESITATION" | "DISCOVERY" | "EXIT_RISK";

export interface DetectedBehaviorPattern {
  patternId: string;
  group: BehaviorGroup;
  confidence: number;
  evidence: string[];
}

// ── Evaluation ───────────────────────────────────────────────
export interface EvaluationData {
  evaluation_id: string;
  session_id: string;
  timestamp: number | string;
  narrative: string;
  frictions_found: FrictionDetection[];
  mswim: MSWIMResult;
  intervention_type: string | null;
  decision_reasoning: string;
  engine?: "llm" | "fast";
  behavior_patterns?: DetectedBehaviorPattern[];
  abandonment_score?: number; // 0–100 predictive abandonment risk
}

// ── Intervention ─────────────────────────────────────────────
export type InterventionStatus =
  | "sent"
  | "delivered"
  | "dismissed"
  | "converted"
  | "ignored";

export interface InterventionData {
  intervention_id: string;
  session_id: string;
  type: string;
  action_code: string;
  friction_id: string;
  timestamp: number | string;
  message?: string;
  cta_label?: string;
  cta_action?: string;
  mswim_score: number;
  mswim_tier: string;
  status?: InterventionStatus;
  voice_enabled?: boolean;
}

// ── WebSocket Messages ───────────────────────────────────────
export type WSMessage =
  | { type: "connected"; channel: string; sessionId: string | null }
  | { type: "track_event"; sessionId: string; data: TrackEventData }
  | { type: "evaluation"; sessionId: string; data: EvaluationData }
  | { type: "intervention"; sessionId: string; data: InterventionData }
  | { type: "onboarding_progress"; data: Record<string, unknown> };

// ── Session (from REST API) ──────────────────────────────────
export interface SessionSummary {
  id: string;
  visitorId: string | null;
  siteUrl: string;
  status: string;
  startedAt: string;
  lastActivityAt: string;
  deviceType: string;
  cartValue: number;
  cartItemCount: number;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalConversions: number;
  currentPageType: string | null;
  currentPageUrl: string | null;
}

// ── Analytics (from REST API) ────────────────────────────────
export interface OverviewAnalytics {
  totalSessions: number;
  activeSessions: number;
  totalEvents: number;
  totalEvaluations: number;
  totalInterventions: number;
  interventionEfficiency: {
    fired: number;
    delivered: number;
    dismissed: number;
    converted: number;
    ignored: number;
    conversionRate: number;
    dismissalRate: number;
  };
  tierDistribution: Record<ScoreTier, number>;
  frictionHotspots: Array<{
    frictionId: string;
    count: number;
    category: string;
  }>;
  // Enriched analytics fields
  bounceRate?: number;
  avgSessionDurationMs?: number;
  avgPageViewsPerSession?: number;
}

// ── Voice Analytics (from REST API) ──────────────────────────
export interface VoiceAnalytics {
  voice: {
    fired: number;
    converted: number;
    dismissed: number;
    ignored: number;
    conversionRate: number;
    dismissalRate: number;
  };
  text: {
    fired: number;
    converted: number;
    dismissed: number;
    ignored: number;
    conversionRate: number;
    dismissalRate: number;
  };
  sessions: {
    voiceActive: number;
    muted: number;
    muteRate: number;
  };
}

// ── Friction Analytics (from REST API) ───────────────────────
export interface FrictionAnalyticsRow {
  frictionId: string;
  category: string;
  severity: number;
  detections: number;
  interventionsFired: number;
  conversions: number;
  dismissals: number;
  resolutionRate: number;
  avgMswimAtDetection: number | null;
}

export interface FrictionSeverityDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface FrictionAnalytics {
  byFriction: FrictionAnalyticsRow[];
  trend: Array<Record<string, string | number>>;
  top5Ids: string[];
  severityDistribution: FrictionSeverityDistribution;
}

// ── Revenue Attribution (from REST API) ──────────────────────
export interface RevenueAttributionRow {
  frictionId: string;
  conversions: number;
  totalLift: number;
  avgLift: number;
}

export interface RevenueAttribution {
  totalAttributedRevenue: number;
  totalConvertedInterventions: number;
  avgLiftPerConversion: number;
  controlGroupSessions?: number;
  byFriction: RevenueAttributionRow[];
}

// ── Merchant Insights (from REST API) ────────────────────────
export interface InsightRecommendation {
  frictionId: string;
  page: string;
  impactEstimate: string;
  fixText: string;
  confidence: "high" | "medium" | "low";
  sampleSize: number;
}

export interface InsightSnapshot {
  id: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  sessionsAnalyzed: number;
  frictionsCaught: number;
  attributedRevenue: number;
  topFrictionTypes: string[];
  wowDeltaPct: number | null;
  recommendations: InsightRecommendation[];
}

export interface InsightsResponse {
  snapshot: InsightSnapshot | null;
}

// ── CRO Findings (from REST API) ─────────────────────────────
export interface CROFinding {
  frictionId: string;
  page: string;
  eventCount: number;
  avgSeverity: number;
  sessionsImpacted: number;
  suggestion: string;
}

export interface CROResponse {
  generatedAt: string;
  findings: CROFinding[];
}

// ── Webhook Delivery Stats (from REST API) ───────────────────
export interface WebhookStats {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  successRate: number;
}

export interface WebhookDeliveryRecord {
  id: string;
  sessionId: string;
  status: string;
  attempts: number;
  responseCode: number | null;
  createdAt: string;
  lastAttemptAt: string | null;
  errorMessage: string | null;
}

export interface WebhookStatsResponse {
  stats: WebhookStats;
  recent: WebhookDeliveryRecord[];
}

// ── Evaluation with abandonment score ────────────────────────
export type AbandonmentScore = number; // 0–100

// ── Network Flywheel (Story 10) ───────────────────────────────
export interface NetworkStatus {
  totalPatterns: number;
  site: {
    siteUrl: string;
    networkOptIn: boolean;
    contributionSessions: number;
  } | null;
}

// ── Tab Type ─────────────────────────────────────────────────
export type TabId = "track" | "evaluate" | "intervene";
