import { z } from "zod";
export declare const EventCategorySchema: z.ZodEnum<["navigation", "search", "product", "cart", "checkout", "account", "engagement", "technical", "system"]>;
export declare const PageTypeSchema: z.ZodEnum<["landing", "category", "search_results", "pdp", "cart", "checkout", "account", "other"]>;
export declare const DeviceTypeSchema: z.ZodEnum<["mobile", "tablet", "desktop"]>;
export declare const ReferrerTypeSchema: z.ZodEnum<["direct", "organic", "paid", "social", "email", "referral"]>;
export declare const PageContextSchema: z.ZodObject<{
    page_type: z.ZodEnum<["landing", "category", "search_results", "pdp", "cart", "checkout", "account", "other"]>;
    page_url: z.ZodString;
    time_on_page_ms: z.ZodNumber;
    scroll_depth_pct: z.ZodNumber;
    viewport: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        width: number;
        height: number;
    }, {
        width: number;
        height: number;
    }>;
    device: z.ZodEnum<["mobile", "tablet", "desktop"]>;
}, "strip", z.ZodTypeAny, {
    page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
    page_url: string;
    time_on_page_ms: number;
    scroll_depth_pct: number;
    viewport: {
        width: number;
        height: number;
    };
    device: "mobile" | "tablet" | "desktop";
}, {
    page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
    page_url: string;
    time_on_page_ms: number;
    scroll_depth_pct: number;
    viewport: {
        width: number;
        height: number;
    };
    device: "mobile" | "tablet" | "desktop";
}>;
/** Track event message from widget */
export declare const WsTrackMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"track">;
    visitorKey: z.ZodOptional<z.ZodString>;
    sessionKey: z.ZodOptional<z.ZodString>;
    siteUrl: z.ZodOptional<z.ZodString>;
    deviceType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["mobile", "tablet", "desktop"]>>>;
    referrerType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["direct", "organic", "paid", "social", "email", "referral"]>>>;
    visitorId: z.ZodOptional<z.ZodString>;
    isLoggedIn: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    isRepeatVisitor: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    event: z.ZodObject<{
        event_id: z.ZodOptional<z.ZodString>;
        friction_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        category: z.ZodOptional<z.ZodEnum<["navigation", "search", "product", "cart", "checkout", "account", "engagement", "technical", "system"]>>;
        event_type: z.ZodOptional<z.ZodString>;
        raw_signals: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        page_context: z.ZodOptional<z.ZodObject<{
            page_type: z.ZodEnum<["landing", "category", "search_results", "pdp", "cart", "checkout", "account", "other"]>;
            page_url: z.ZodString;
            time_on_page_ms: z.ZodNumber;
            scroll_depth_pct: z.ZodNumber;
            viewport: z.ZodObject<{
                width: z.ZodNumber;
                height: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                width: number;
                height: number;
            }, {
                width: number;
                height: number;
            }>;
            device: z.ZodEnum<["mobile", "tablet", "desktop"]>;
        }, "strip", z.ZodTypeAny, {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        }, {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        }>>;
        timestamp: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "track";
    deviceType: "mobile" | "tablet" | "desktop";
    referrerType: "direct" | "organic" | "paid" | "social" | "email" | "referral";
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    event: {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    siteUrl?: string | undefined;
    visitorKey?: string | undefined;
    sessionKey?: string | undefined;
    visitorId?: string | undefined;
}, {
    type: "track";
    event: {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    siteUrl?: string | undefined;
    visitorKey?: string | undefined;
    deviceType?: "mobile" | "tablet" | "desktop" | undefined;
    referrerType?: "direct" | "organic" | "paid" | "social" | "email" | "referral" | undefined;
    isLoggedIn?: boolean | undefined;
    isRepeatVisitor?: boolean | undefined;
    sessionKey?: string | undefined;
    visitorId?: string | undefined;
}>;
/** Ping message */
export declare const WsPingMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"ping">;
}, "strip", z.ZodTypeAny, {
    type: "ping";
}, {
    type: "ping";
}>;
/** Discriminated union for widget channel */
export declare const WsWidgetMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"track">;
    visitorKey: z.ZodOptional<z.ZodString>;
    sessionKey: z.ZodOptional<z.ZodString>;
    siteUrl: z.ZodOptional<z.ZodString>;
    deviceType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["mobile", "tablet", "desktop"]>>>;
    referrerType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["direct", "organic", "paid", "social", "email", "referral"]>>>;
    visitorId: z.ZodOptional<z.ZodString>;
    isLoggedIn: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    isRepeatVisitor: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    event: z.ZodObject<{
        event_id: z.ZodOptional<z.ZodString>;
        friction_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        category: z.ZodOptional<z.ZodEnum<["navigation", "search", "product", "cart", "checkout", "account", "engagement", "technical", "system"]>>;
        event_type: z.ZodOptional<z.ZodString>;
        raw_signals: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        page_context: z.ZodOptional<z.ZodObject<{
            page_type: z.ZodEnum<["landing", "category", "search_results", "pdp", "cart", "checkout", "account", "other"]>;
            page_url: z.ZodString;
            time_on_page_ms: z.ZodNumber;
            scroll_depth_pct: z.ZodNumber;
            viewport: z.ZodObject<{
                width: z.ZodNumber;
                height: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                width: number;
                height: number;
            }, {
                width: number;
                height: number;
            }>;
            device: z.ZodEnum<["mobile", "tablet", "desktop"]>;
        }, "strip", z.ZodTypeAny, {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        }, {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        }>>;
        timestamp: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "track";
    deviceType: "mobile" | "tablet" | "desktop";
    referrerType: "direct" | "organic" | "paid" | "social" | "email" | "referral";
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    event: {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    siteUrl?: string | undefined;
    visitorKey?: string | undefined;
    sessionKey?: string | undefined;
    visitorId?: string | undefined;
}, {
    type: "track";
    event: {
        category?: "search" | "cart" | "checkout" | "product" | "navigation" | "account" | "system" | "technical" | "engagement" | undefined;
        timestamp?: number | undefined;
        friction_id?: string | null | undefined;
        event_id?: string | undefined;
        event_type?: string | undefined;
        raw_signals?: Record<string, unknown> | undefined;
        page_context?: {
            page_type: "category" | "landing" | "pdp" | "cart" | "checkout" | "search_results" | "account" | "other";
            page_url: string;
            time_on_page_ms: number;
            scroll_depth_pct: number;
            viewport: {
                width: number;
                height: number;
            };
            device: "mobile" | "tablet" | "desktop";
        } | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    siteUrl?: string | undefined;
    visitorKey?: string | undefined;
    deviceType?: "mobile" | "tablet" | "desktop" | undefined;
    referrerType?: "direct" | "organic" | "paid" | "social" | "email" | "referral" | undefined;
    isLoggedIn?: boolean | undefined;
    isRepeatVisitor?: boolean | undefined;
    sessionKey?: string | undefined;
    visitorId?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"ping">;
}, "strip", z.ZodTypeAny, {
    type: "ping";
}, {
    type: "ping";
}>]>;
/** Voice query message: transcript captured via Deepgram STT, sent by the widget */
export declare const WsVoiceQuerySchema: z.ZodObject<{
    type: z.ZodLiteral<"voice_query">;
    session_id: z.ZodString;
    transcript: z.ZodString;
    timestamp: z.ZodNumber;
    /** Optional page context — enriches the LLM system prompt for more relevant replies */
    page_context: z.ZodOptional<z.ZodObject<{
        page_type: z.ZodOptional<z.ZodString>;
        page_url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        page_type?: string | undefined;
        page_url?: string | undefined;
    }, {
        page_type?: string | undefined;
        page_url?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "voice_query";
    timestamp: number;
    session_id: string;
    transcript: string;
    page_context?: {
        page_type?: string | undefined;
        page_url?: string | undefined;
    } | undefined;
}, {
    type: "voice_query";
    timestamp: number;
    session_id: string;
    transcript: string;
    page_context?: {
        page_type?: string | undefined;
        page_url?: string | undefined;
    } | undefined;
}>;
/** Agent query message: text/voice transcript routed to the shopping-agent service */
export declare const WsAgentQuerySchema: z.ZodObject<{
    type: z.ZodLiteral<"agent_query">;
    sessionId: z.ZodString;
    query: z.ZodString;
    pageContext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    siteConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    addToCartSelector: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    type: "agent_query";
    query: string;
    pageContext?: Record<string, unknown> | undefined;
    siteConfig?: Record<string, unknown> | undefined;
    addToCartSelector?: string | undefined;
}, {
    sessionId: string;
    type: "agent_query";
    query: string;
    pageContext?: Record<string, unknown> | undefined;
    siteConfig?: Record<string, unknown> | undefined;
    addToCartSelector?: string | undefined;
}>;
export declare const InterventionOutcomeSchema: z.ZodObject<{
    type: z.ZodLiteral<"intervention_outcome">;
    intervention_id: z.ZodString;
    session_id: z.ZodString;
    status: z.ZodEnum<["delivered", "dismissed", "converted", "ignored", "voice_muted"]>;
    timestamp: z.ZodNumber;
    conversion_action: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "intervention_outcome";
    status: "delivered" | "dismissed" | "converted" | "ignored" | "voice_muted";
    timestamp: number;
    session_id: string;
    intervention_id: string;
    conversion_action?: string | undefined;
}, {
    type: "intervention_outcome";
    status: "delivered" | "dismissed" | "converted" | "ignored" | "voice_muted";
    timestamp: number;
    session_id: string;
    intervention_id: string;
    conversion_action?: string | undefined;
}>;
export declare const InterventionFeedbackSchema: z.ZodObject<{
    type: z.ZodLiteral<"intervention_feedback">;
    intervention_id: z.ZodString;
    session_id: z.ZodString;
    feedback: z.ZodEnum<["helpful", "not_helpful"]>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "intervention_feedback";
    timestamp: number;
    feedback: "helpful" | "not_helpful";
    session_id: string;
    intervention_id: string;
}, {
    type: "intervention_feedback";
    timestamp: number;
    feedback: "helpful" | "not_helpful";
    session_id: string;
    intervention_id: string;
}>;
export declare const WsDashboardMessageSchema: z.ZodObject<{
    type: z.ZodString;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    session_id: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: string;
    timestamp?: number | undefined;
    payload?: Record<string, unknown> | undefined;
    session_id?: string | undefined;
}, {
    type: string;
    timestamp?: number | undefined;
    payload?: Record<string, unknown> | undefined;
    session_id?: string | undefined;
}>;
export declare const SessionsQuerySchema: z.ZodObject<{
    siteUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    siteUrl?: string | undefined;
}, {
    siteUrl?: string | undefined;
}>;
export declare const EventsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    since: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    since?: string | undefined;
}, {
    limit?: number | undefined;
    since?: string | undefined;
}>;
export declare const ScoringConfigCreateSchema: z.ZodObject<{
    name: z.ZodString;
    siteUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    wIntent: z.ZodNumber;
    wFriction: z.ZodNumber;
    wClarity: z.ZodNumber;
    wReceptivity: z.ZodNumber;
    wValue: z.ZodNumber;
    tMonitor: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    tPassive: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    tNudge: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    tActive: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    gatesJson: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    isActive: boolean;
    wIntent: number;
    wFriction: number;
    wClarity: number;
    wReceptivity: number;
    wValue: number;
    tMonitor: number;
    tPassive: number;
    tNudge: number;
    tActive: number;
    siteUrl?: string | null | undefined;
    gatesJson?: string | null | undefined;
}, {
    name: string;
    wIntent: number;
    wFriction: number;
    wClarity: number;
    wReceptivity: number;
    wValue: number;
    siteUrl?: string | null | undefined;
    isActive?: boolean | undefined;
    tMonitor?: number | undefined;
    tPassive?: number | undefined;
    tNudge?: number | undefined;
    tActive?: number | undefined;
    gatesJson?: string | null | undefined;
}>;
export declare const ScoringConfigUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    siteUrl: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>>;
    wIntent: z.ZodOptional<z.ZodNumber>;
    wFriction: z.ZodOptional<z.ZodNumber>;
    wClarity: z.ZodOptional<z.ZodNumber>;
    wReceptivity: z.ZodOptional<z.ZodNumber>;
    wValue: z.ZodOptional<z.ZodNumber>;
    tMonitor: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    tPassive: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    tNudge: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    tActive: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    gatesJson: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    siteUrl?: string | null | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    wIntent?: number | undefined;
    wFriction?: number | undefined;
    wClarity?: number | undefined;
    wReceptivity?: number | undefined;
    wValue?: number | undefined;
    tMonitor?: number | undefined;
    tPassive?: number | undefined;
    tNudge?: number | undefined;
    tActive?: number | undefined;
    gatesJson?: string | null | undefined;
}, {
    siteUrl?: string | null | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    wIntent?: number | undefined;
    wFriction?: number | undefined;
    wClarity?: number | undefined;
    wReceptivity?: number | undefined;
    wValue?: number | undefined;
    tMonitor?: number | undefined;
    tPassive?: number | undefined;
    tNudge?: number | undefined;
    tActive?: number | undefined;
    gatesJson?: string | null | undefined;
}>;
export declare const OnboardingStartSchema: z.ZodEffects<z.ZodObject<{
    siteId: z.ZodOptional<z.ZodString>;
    siteUrl: z.ZodOptional<z.ZodString>;
    html: z.ZodOptional<z.ZodString>;
    forceReanalyze: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    platform: z.ZodDefault<z.ZodOptional<z.ZodEnum<["shopify", "woocommerce", "magento", "custom"]>>>;
    trackingConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    platform: "shopify" | "woocommerce" | "magento" | "custom";
    forceReanalyze: boolean;
    siteUrl?: string | undefined;
    siteId?: string | undefined;
    html?: string | undefined;
    trackingConfig?: Record<string, unknown> | undefined;
}, {
    siteUrl?: string | undefined;
    platform?: "shopify" | "woocommerce" | "magento" | "custom" | undefined;
    siteId?: string | undefined;
    html?: string | undefined;
    forceReanalyze?: boolean | undefined;
    trackingConfig?: Record<string, unknown> | undefined;
}>, {
    platform: "shopify" | "woocommerce" | "magento" | "custom";
    forceReanalyze: boolean;
    siteUrl?: string | undefined;
    siteId?: string | undefined;
    html?: string | undefined;
    trackingConfig?: Record<string, unknown> | undefined;
}, {
    siteUrl?: string | undefined;
    platform?: "shopify" | "woocommerce" | "magento" | "custom" | undefined;
    siteId?: string | undefined;
    html?: string | undefined;
    forceReanalyze?: boolean | undefined;
    trackingConfig?: Record<string, unknown> | undefined;
}>;
export declare const OnboardingResultsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare const IntegrationActivateSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["auto", "active", "limited_active"]>>>;
    criticalJourneysPassed: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    criticalJourneysPassed: boolean;
    mode: "active" | "limited_active" | "auto";
    notes?: string | undefined;
}, {
    criticalJourneysPassed?: boolean | undefined;
    mode?: "active" | "limited_active" | "auto" | undefined;
    notes?: string | undefined;
}>;
/** Phase 1.1.5 — wizard paste-URL Shopify slice */
export declare const ShopifyQuickOnboardSchema: z.ZodObject<{
    shopUrl: z.ZodString;
    /** Public Shopify Storefront API token (NOT OAuth — Phase 1.3 adds OAuth). */
    storefrontToken: z.ZodString;
    /** Optional: override max products ingested in this pass. */
    maxProducts: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    shopUrl: string;
    storefrontToken: string;
    maxProducts?: number | undefined;
}, {
    shopUrl: string;
    storefrontToken: string;
    maxProducts?: number | undefined;
}>;
/**
 * Phase 1.4.3 — wizard paste-URL WooCommerce slice. Credentials optional:
 *   - Omit both → public Store API path (limited fields, no inventory).
 *   - Provide both → authenticated REST v3 path (richer data + inventory).
 */
export declare const WooCommerceQuickOnboardSchema: z.ZodEffects<z.ZodObject<{
    shopUrl: z.ZodString;
    consumerKey: z.ZodOptional<z.ZodString>;
    consumerSecret: z.ZodOptional<z.ZodString>;
    maxProducts: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    shopUrl: string;
    maxProducts?: number | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}, {
    shopUrl: string;
    maxProducts?: number | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}>, {
    shopUrl: string;
    maxProducts?: number | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}, {
    shopUrl: string;
    maxProducts?: number | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}>;
/**
 * Phase 1.5.3 — unified onboarding entrypoint. Accepts the union of fields
 * for all platforms; server detects the platform first and validates the
 * platform-specific subset itself. Wizard no longer needs to know which
 * platform's endpoint to call.
 */
export declare const QuickOnboardSchema: z.ZodEffects<z.ZodObject<{
    shopUrl: z.ZodString;
    storefrontToken: z.ZodOptional<z.ZodString>;
    consumerKey: z.ZodOptional<z.ZodString>;
    consumerSecret: z.ZodOptional<z.ZodString>;
    maxProducts: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    shopUrl: string;
    maxProducts?: number | undefined;
    storefrontToken?: string | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}, {
    shopUrl: string;
    maxProducts?: number | undefined;
    storefrontToken?: string | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}>, {
    shopUrl: string;
    maxProducts?: number | undefined;
    storefrontToken?: string | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}, {
    shopUrl: string;
    maxProducts?: number | undefined;
    storefrontToken?: string | undefined;
    consumerKey?: string | undefined;
    consumerSecret?: string | undefined;
}>;
export declare const IntegrationVerifySchema: z.ZodObject<{
    runId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    runId?: string | undefined;
}, {
    runId?: string | undefined;
}>;
export declare const ExperimentCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    siteUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    trafficPercent: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    variants: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        weight: z.ZodNumber;
        scoringConfigId: z.ZodOptional<z.ZodString>;
        evalEngine: z.ZodOptional<z.ZodEnum<["llm", "fast", "auto"]>>;
        modelId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        weight: number;
        modelId?: string | undefined;
        scoringConfigId?: string | undefined;
        evalEngine?: "llm" | "auto" | "fast" | undefined;
    }, {
        id: string;
        name: string;
        weight: number;
        modelId?: string | undefined;
        scoringConfigId?: string | undefined;
        evalEngine?: "llm" | "auto" | "fast" | undefined;
    }>, "many">;
    primaryMetric: z.ZodDefault<z.ZodOptional<z.ZodEnum<["conversion_rate", "dismissal_rate", "composite_score"]>>>;
    minSampleSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    variants: {
        id: string;
        name: string;
        weight: number;
        modelId?: string | undefined;
        scoringConfigId?: string | undefined;
        evalEngine?: "llm" | "auto" | "fast" | undefined;
    }[];
    trafficPercent: number;
    primaryMetric: "conversion_rate" | "composite_score" | "dismissal_rate";
    minSampleSize: number;
    siteUrl?: string | null | undefined;
    description?: string | undefined;
}, {
    name: string;
    variants: {
        id: string;
        name: string;
        weight: number;
        modelId?: string | undefined;
        scoringConfigId?: string | undefined;
        evalEngine?: "llm" | "auto" | "fast" | undefined;
    }[];
    siteUrl?: string | null | undefined;
    description?: string | undefined;
    trafficPercent?: number | undefined;
    primaryMetric?: "conversion_rate" | "composite_score" | "dismissal_rate" | undefined;
    minSampleSize?: number | undefined;
}>;
export declare const RolloutCreateSchema: z.ZodObject<{
    name: z.ZodString;
    siteUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    changeType: z.ZodEnum<["scoring_config", "eval_engine", "gate_thresholds"]>;
    newConfigId: z.ZodOptional<z.ZodString>;
    newEvalEngine: z.ZodOptional<z.ZodEnum<["llm", "fast", "auto"]>>;
    configPayload: z.ZodOptional<z.ZodString>;
    stages: z.ZodArray<z.ZodObject<{
        percent: z.ZodNumber;
        durationHours: z.ZodNumber;
        healthChecks: z.ZodObject<{
            minConversionRate: z.ZodOptional<z.ZodNumber>;
            maxDismissalRate: z.ZodOptional<z.ZodNumber>;
            maxDivergence: z.ZodOptional<z.ZodNumber>;
            minSampleSize: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        }, {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        percent: number;
        durationHours: number;
        healthChecks: {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        };
    }, {
        percent: number;
        durationHours: number;
        healthChecks: {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        };
    }>, "many">;
    healthCriteria: z.ZodObject<{
        minConversionRate: z.ZodOptional<z.ZodNumber>;
        maxDismissalRate: z.ZodOptional<z.ZodNumber>;
        maxDivergence: z.ZodOptional<z.ZodNumber>;
        minSampleSize: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        minSampleSize?: number | undefined;
        minConversionRate?: number | undefined;
        maxDismissalRate?: number | undefined;
        maxDivergence?: number | undefined;
    }, {
        minSampleSize?: number | undefined;
        minConversionRate?: number | undefined;
        maxDismissalRate?: number | undefined;
        maxDivergence?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    changeType: "scoring_config" | "eval_engine" | "gate_thresholds";
    stages: {
        percent: number;
        durationHours: number;
        healthChecks: {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        };
    }[];
    healthCriteria: {
        minSampleSize?: number | undefined;
        minConversionRate?: number | undefined;
        maxDismissalRate?: number | undefined;
        maxDivergence?: number | undefined;
    };
    siteUrl?: string | null | undefined;
    newConfigId?: string | undefined;
    newEvalEngine?: "llm" | "auto" | "fast" | undefined;
    configPayload?: string | undefined;
}, {
    name: string;
    changeType: "scoring_config" | "eval_engine" | "gate_thresholds";
    stages: {
        percent: number;
        durationHours: number;
        healthChecks: {
            minSampleSize?: number | undefined;
            minConversionRate?: number | undefined;
            maxDismissalRate?: number | undefined;
            maxDivergence?: number | undefined;
        };
    }[];
    healthCriteria: {
        minSampleSize?: number | undefined;
        minConversionRate?: number | undefined;
        maxDismissalRate?: number | undefined;
        maxDivergence?: number | undefined;
    };
    siteUrl?: string | null | undefined;
    newConfigId?: string | undefined;
    newEvalEngine?: "llm" | "auto" | "fast" | undefined;
    configPayload?: string | undefined;
}>;
export declare const JobTriggerSchema: z.ZodObject<{
    job: z.ZodEnum<["nightly_batch", "drift_check", "rollout_health"]>;
}, "strip", z.ZodTypeAny, {
    job: "rollout_health" | "nightly_batch" | "drift_check";
}, {
    job: "rollout_health" | "nightly_batch" | "drift_check";
}>;
/**
 * Validate data against a Zod schema.
 * Returns typed success/error result.
 */
export declare function validatePayload<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
//# sourceMappingURL=schemas.d.ts.map