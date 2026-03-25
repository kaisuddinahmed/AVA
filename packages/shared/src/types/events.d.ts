export interface TrackEvent {
    event_id: string;
    session_id: string;
    timestamp: number;
    category: EventCategory;
    event_type: string;
    friction_id: string | null;
    page_context: PageContext;
    raw_signals: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export type EventCategory = "navigation" | "search" | "product" | "cart" | "checkout" | "account" | "engagement" | "technical" | "system";
export interface PageContext {
    page_type: PageType;
    page_url: string;
    time_on_page_ms: number;
    scroll_depth_pct: number;
    viewport: {
        width: number;
        height: number;
    };
    device: DeviceType;
}
export type PageType = "landing" | "category" | "search_results" | "pdp" | "cart" | "checkout" | "account" | "other";
export type DeviceType = "mobile" | "tablet" | "desktop";
export interface UserContext {
    user_id: string | null;
    session_id: string;
    is_new_visitor: boolean;
    is_logged_in: boolean;
    session_start_ts: number;
    cart_value: number;
    cart_item_count: number;
    lifetime_order_count: number;
    lifetime_order_value: number;
    referrer_type: ReferrerType;
    acquisition_channel: string | null;
}
export type ReferrerType = "direct" | "organic" | "paid" | "social" | "email" | "referral";
export interface RawSignal {
    signal_key: string;
    signal_value: unknown;
    confidence: number;
    source: "observer" | "rule" | "llm";
}
//# sourceMappingURL=events.d.ts.map