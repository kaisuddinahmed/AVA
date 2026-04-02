import { z } from "zod";
// ============================================================================
// ENUMS / LITERALS
// ============================================================================
export const EventCategorySchema = z.enum([
    "navigation", "search", "product", "cart", "checkout",
    "account", "engagement", "technical", "system",
]);
export const PageTypeSchema = z.enum([
    "landing", "category", "search_results", "pdp",
    "cart", "checkout", "account", "other",
]);
export const DeviceTypeSchema = z.enum(["mobile", "tablet", "desktop"]);
export const ReferrerTypeSchema = z.enum([
    "direct", "organic", "paid", "social", "email", "referral",
]);
// ============================================================================
// PAGE CONTEXT
// ============================================================================
export const PageContextSchema = z.object({
    page_type: PageTypeSchema,
    page_url: z.string(),
    time_on_page_ms: z.number().int().nonnegative(),
    scroll_depth_pct: z.number().min(0).max(100),
    viewport: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
    }),
    device: DeviceTypeSchema,
});
// ============================================================================
// WEBSOCKET: WIDGET CHANNEL
// ============================================================================
/** Track event message from widget */
export const WsTrackMessageSchema = z.object({
    type: z.literal("track"),
    visitorKey: z.string().optional(),
    sessionKey: z.string().optional(),
    siteUrl: z.string().optional(),
    deviceType: DeviceTypeSchema.optional().default("desktop"),
    referrerType: ReferrerTypeSchema.optional().default("direct"),
    visitorId: z.string().optional(),
    isLoggedIn: z.boolean().optional().default(false),
    isRepeatVisitor: z.boolean().optional().default(false),
    event: z.object({
        event_id: z.string().optional(),
        friction_id: z.string().nullable().optional(),
        category: EventCategorySchema.optional(),
        event_type: z.string().optional(),
        raw_signals: z.record(z.unknown()).optional(),
        page_context: PageContextSchema.optional(),
        timestamp: z.number().optional(),
        metadata: z.record(z.unknown()).optional(),
    }),
});
/** Ping message */
export const WsPingMessageSchema = z.object({
    type: z.literal("ping"),
});
/** Discriminated union for widget channel */
export const WsWidgetMessageSchema = z.discriminatedUnion("type", [
    WsTrackMessageSchema,
    WsPingMessageSchema,
]);
// ============================================================================
// WEBSOCKET: VOICE QUERY (from widget ASR — Phase 2)
// ============================================================================
/** Voice query message: transcript captured via Deepgram STT, sent by the widget */
export const WsVoiceQuerySchema = z.object({
    type: z.literal("voice_query"),
    session_id: z.string(),
    transcript: z.string().min(1).max(2000),
    timestamp: z.number(),
    /** Optional page context — enriches the LLM system prompt for more relevant replies */
    page_context: z.object({
        page_type: z.string().optional(),
        page_url: z.string().optional(),
    }).optional(),
});
// ============================================================================
// WEBSOCKET: INTERVENTION OUTCOME (from widget)
// ============================================================================
export const InterventionOutcomeSchema = z.object({
    type: z.literal("intervention_outcome"),
    intervention_id: z.string(),
    session_id: z.string(),
    status: z.enum(["delivered", "dismissed", "converted", "ignored", "voice_muted"]),
    timestamp: z.number(),
    conversion_action: z.string().optional(),
});
// ============================================================================
// WEBSOCKET: INTERVENTION FEEDBACK (from widget — thumbs up/down)
// ============================================================================
export const InterventionFeedbackSchema = z.object({
    type: z.literal("intervention_feedback"),
    intervention_id: z.string(),
    session_id: z.string(),
    feedback: z.enum(["helpful", "not_helpful"]),
    timestamp: z.number(),
});
// ============================================================================
// WEBSOCKET: DASHBOARD CHANNEL
// ============================================================================
export const WsDashboardMessageSchema = z.object({
    type: z.string(),
    payload: z.record(z.unknown()).optional(),
    session_id: z.string().optional(),
    timestamp: z.number().optional(),
});
// ============================================================================
// API: QUERY PARAMS
// ============================================================================
export const SessionsQuerySchema = z.object({
    siteUrl: z.string().optional(),
});
export const EventsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(1000).optional().default(100),
    since: z.string().datetime().optional(),
});
// ============================================================================
// API: SCORING CONFIG BODY
// ============================================================================
export const ScoringConfigCreateSchema = z.object({
    name: z.string().min(1).max(100),
    siteUrl: z.string().optional().nullable(),
    isActive: z.boolean().optional().default(false),
    wIntent: z.number().min(0).max(1),
    wFriction: z.number().min(0).max(1),
    wClarity: z.number().min(0).max(1),
    wReceptivity: z.number().min(0).max(1),
    wValue: z.number().min(0).max(1),
    tMonitor: z.number().int().min(0).max(100).optional().default(29),
    tPassive: z.number().int().min(0).max(100).optional().default(49),
    tNudge: z.number().int().min(0).max(100).optional().default(64),
    tActive: z.number().int().min(0).max(100).optional().default(79),
    gatesJson: z.string().optional().nullable(),
});
export const ScoringConfigUpdateSchema = ScoringConfigCreateSchema.partial();
// ============================================================================
// API: ONBOARDING + INTEGRATION
// ============================================================================
export const OnboardingStartSchema = z
    .object({
    siteId: z.string().optional(),
    siteUrl: z.string().min(1).optional(),
    html: z.string().optional(),
    forceReanalyze: z.boolean().optional().default(false),
    platform: z
        .enum(["shopify", "woocommerce", "magento", "custom"])
        .optional()
        .default("custom"),
    trackingConfig: z.record(z.unknown()).optional(),
})
    .refine((data) => Boolean(data.siteId || data.siteUrl), {
    message: "Either siteId or siteUrl is required",
    path: ["siteId"],
});
export const OnboardingResultsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(500).optional().default(100),
});
export const IntegrationActivateSchema = z.object({
    mode: z.enum(["auto", "active", "limited_active"]).optional().default("auto"),
    criticalJourneysPassed: z.boolean().optional().default(false),
    notes: z.string().max(2000).optional(),
});
export const IntegrationVerifySchema = z.object({
    runId: z.string().optional(),
});
// ============================================================================
// API: EXPERIMENTS
// ============================================================================
const ExperimentVariantSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    weight: z.number().min(0).max(1),
    scoringConfigId: z.string().optional(),
    evalEngine: z.enum(["llm", "fast", "auto"]).optional(),
    modelId: z.string().optional(),
});
export const ExperimentCreateSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    siteUrl: z.string().optional().nullable(),
    trafficPercent: z.number().int().min(1).max(100).optional().default(100),
    variants: z.array(ExperimentVariantSchema).min(2).max(10),
    primaryMetric: z
        .enum(["conversion_rate", "dismissal_rate", "composite_score"])
        .optional()
        .default("conversion_rate"),
    minSampleSize: z.number().int().min(10).max(100000).optional().default(100),
});
// ============================================================================
// API: ROLLOUTS
// ============================================================================
const RolloutHealthCriteriaSchema = z.object({
    minConversionRate: z.number().min(0).max(1).optional(),
    maxDismissalRate: z.number().min(0).max(1).optional(),
    maxDivergence: z.number().min(0).max(100).optional(),
    minSampleSize: z.number().int().min(1).optional(),
});
const RolloutStageSchema = z.object({
    percent: z.number().int().min(1).max(100),
    durationHours: z.number().min(1).max(720),
    healthChecks: RolloutHealthCriteriaSchema,
});
export const RolloutCreateSchema = z.object({
    name: z.string().min(1).max(200),
    siteUrl: z.string().optional().nullable(),
    changeType: z.enum(["scoring_config", "eval_engine", "gate_thresholds"]),
    newConfigId: z.string().optional(),
    newEvalEngine: z.enum(["llm", "fast", "auto"]).optional(),
    configPayload: z.string().optional(),
    stages: z.array(RolloutStageSchema).min(1).max(10),
    healthCriteria: RolloutHealthCriteriaSchema,
});
// ============================================================================
// API: JOBS
// ============================================================================
export const JobTriggerSchema = z.object({
    job: z.enum(["nightly_batch", "drift_check", "rollout_health"]),
});
// ============================================================================
// UTILITY
// ============================================================================
/**
 * Validate data against a Zod schema.
 * Returns typed success/error result.
 */
export function validatePayload(schema, data) {
    const result = schema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return {
        success: false,
        error: result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
    };
}
//# sourceMappingURL=schemas.js.map