import type { ProductCard, ComparisonCard, UIAdjustment } from "./widget.js";
/**
 * Intervention type tiers matching MSWIM output.
 */
export type InterventionType = "passive" | "nudge" | "active" | "escalate";
/**
 * Lifecycle status of an intervention.
 */
export type InterventionStatus = "sent" | "delivered" | "dismissed" | "converted" | "ignored" | "voice_muted";
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
    message?: string;
    products?: ProductCard[];
    comparison?: ComparisonCard;
    ui_adjustment?: UIAdjustment;
    cta_label?: string;
    cta_action?: string;
    mswim_score: number;
    mswim_tier: string;
    voice_enabled?: boolean;
    voice_script?: string;
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
//# sourceMappingURL=intervention.d.ts.map