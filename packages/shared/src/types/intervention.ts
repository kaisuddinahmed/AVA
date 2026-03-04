// ============================================================================
// INTERVENE LAYER TYPES — Commands sent to the widget
// ============================================================================

import type { ProductCard, ComparisonCard, UIAdjustment } from "./widget.js";

/**
 * Intervention type tiers matching MSWIM output.
 */
export type InterventionType = "passive" | "nudge" | "active" | "escalate";

/**
 * Lifecycle status of an intervention.
 */
export type InterventionStatus =
  | "sent"
  | "delivered"
  | "dismissed"
  | "converted"
  | "ignored"
  | "voice_muted";   // user muted voice during this intervention

/**
 * The structured command sent from server to widget via WebSocket.
 */
export interface InterventionCommand {
  intervention_id: string;
  session_id: string;
  type: InterventionType;
  action_code: string;
  friction_id: string;
  timestamp: number;

  // Content
  message?: string;
  products?: ProductCard[];
  comparison?: ComparisonCard;
  ui_adjustment?: UIAdjustment;
  cta_label?: string;
  cta_action?: string;

  // MSWIM snapshot at fire time
  mswim_score: number;
  mswim_tier: string;

  // Voice (Phase 0 — payload carries script; Phase 1 widget plays it via Deepgram TTS)
  voice_enabled?: boolean;   // server sets false when budget exhausted or session muted
  voice_script?: string;     // ≤12 words, direct, store-associate style

  meta?: Record<string, unknown>;
}

/**
 * Outcome feedback sent back from widget to server.
 */
export interface InterventionOutcome {
  intervention_id: string;
  session_id: string;
  status: InterventionStatus;
  timestamp: number;
  conversion_action?: string;
}
