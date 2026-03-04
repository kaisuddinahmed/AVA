/* ──────────────────────────────────────────────────────────────
   Dashboard-local type definitions.
   Mirrors server broadcast shapes so we stay decoupled from
   @ava/shared (which is TS-only, not bundled for the browser).
   ────────────────────────────────────────────────────────────── */

// ── Track Events ─────────────────────────────────────────────
// Server broadcasts NormalizedEvent shape: camelCase fields
export interface TrackEventData {
  id: string;
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

// ── Tab Type ─────────────────────────────────────────────────
export type TabId = "track" | "evaluate" | "intervene";
