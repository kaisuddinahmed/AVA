import type { DeviceType, ReferrerType } from "./events.js";
/**
 * Core session metadata stored in the database.
 */
export interface SessionMetadata {
    id: string;
    visitor_id: string | null;
    site_url: string;
    started_at: number;
    last_activity_at: number;
    device_type: DeviceType;
    referrer_type: ReferrerType;
    is_logged_in: boolean;
    is_repeat_visitor: boolean;
    status: SessionStatus;
}
export type SessionStatus = "active" | "idle" | "ended";
/**
 * Live session state held in memory for MSWIM computations.
 * Extends the DB record with runtime tracking fields.
 */
export interface SessionState extends SessionMetadata {
    cart_value: number;
    cart_item_count: number;
    total_interventions_fired: number;
    total_nudges_fired: number;
    total_actives_fired: number;
    total_dismissals: number;
    total_conversions: number;
    suppress_non_passive: boolean;
    last_intervention_at: number | null;
    last_intervention_type: string | null;
    last_dismiss_at: number | null;
    friction_ids_intervened: string[];
    current_page_type: string;
    current_page_url: string;
}
//# sourceMappingURL=session.d.ts.map