export interface ProductCard {
    product_id: string;
    title: string;
    image_url: string;
    price: number;
    original_price?: number;
    rating: number;
    review_count: number;
    differentiator: string;
    relevance_score: number;
}
export interface ComparisonCard {
    products: [ProductCard, ProductCard];
    differing_attributes: DifferingAttribute[];
    recommendation?: {
        product_id: string;
        reason: string;
    };
}
export interface DifferingAttribute {
    label: string;
    values: [string, string];
}
export interface UIAdjustment {
    adjustment_type: UIAdjustmentType;
    target_selector?: string;
    params: Record<string, unknown>;
}
export type UIAdjustmentType = "inject_shipping_progress_bar" | "enhance_trust_signals" | "sticky_price_bar" | "inject_bnpl_callout" | "highlight_element" | "reorder_content";
export interface WidgetMessage {
    id: string;
    type: "assistant" | "user" | "system";
    content: string;
    payload?: WidgetPayload;
    timestamp: number;
}
export interface WidgetPayload {
    intervention_id?: string;
    type?: string;
    action_code?: string;
    message?: string;
    products?: ProductCard[];
    comparison?: ComparisonCard;
    ui_adjustment?: UIAdjustment;
    cta_label?: string;
    cta_action?: string;
    meta?: Record<string, unknown>;
    voice_enabled?: boolean;
    voice_script?: string;
}
export type WidgetState = "minimized" | "bubble" | "expanded" | "hidden";
export interface WidgetConfig {
    position: "bottom-right" | "bottom-left";
    brand_color: string;
    brand_color_light: string;
    accent_color: string;
    font_family: string;
    websocket_url: string;
    session_id: string;
    user_id: string | null;
    z_index: number;
    avatar_url?: string;
    assistant_name: string;
    max_cards_to_show: number;
    animation_duration: number;
    voice_enabled?: boolean;
    voice_max_per_session?: number;
    deepgram_api_key?: string;
    deepgram_model?: string;
    voice_auto_play?: boolean;
}
//# sourceMappingURL=widget.d.ts.map