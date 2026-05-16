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

// ── Phase 2.7 — Streaming STT + barge-in WS frames ──────────────────────────

/** Begin a streaming STT session. Implicitly cancels any in-flight TTS for
 *  the session (barge-in invariant). */
export const WsVoiceStreamStartSchema = z.object({
  type: z.literal("voice_stream_start"),
  session_id: z.string(),
  page_context: z.object({
    page_type: z.string().optional(),
    page_url: z.string().optional(),
  }).optional(),
});

/** Mic-audio chunk forwarded into the active streaming STT session. The
 *  chunk is base64-encoded so it rides the existing JSON dispatcher.
 *
 *  Codex Phase 2.7 P2: validate the base64 shape strictly — `Buffer.from`
 *  silently truncates malformed input, so the dispatcher's `decode_failed`
 *  branch was unreachable in practice. We enforce:
 *    1. The alphabet (only A-Z a-z 0-9 + / =).
 *    2. Padding at most "==", only as trailing chars.
 *    3. Length is a multiple of 4 (base64 invariant).
 *    4. Round-trip decode→encode equals the input (catches any remaining
 *       padding / canonicalisation drift). */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export const WsAudioChunkSchema = z.object({
  type: z.literal("audio_chunk"),
  session_id: z.string(),
  chunk: z
    .string()
    .min(1)
    .max(200_000)
    .refine((s) => BASE64_RE.test(s), { message: "chunk: invalid base64 alphabet" })
    .refine((s) => s.length % 4 === 0, { message: "chunk: base64 length must be multiple of 4" })
    .refine(
      (s) => {
        try {
          return Buffer.from(s, "base64").toString("base64") === s;
        } catch {
          return false;
        }
      },
      { message: "chunk: base64 round-trip failed" },
    ),
});

/** Finalize the streaming STT session and wait for Deepgram's last
 *  transcript event. */
export const WsVoiceStreamEndSchema = z.object({
  type: z.literal("voice_stream_end"),
  session_id: z.string(),
});

/** Explicitly cancel any in-flight streaming TTS. Used by the widget when
 *  the user dismisses the bubble before AVA finishes speaking. */
export const WsTtsCancelSchema = z.object({
  type: z.literal("tts_cancel"),
  session_id: z.string(),
});

// ============================================================================
// WEBSOCKET: AGENT QUERY (from widget — Story 12 shopping agent)
// ============================================================================

/** Agent query message: text/voice transcript routed to the shopping-agent service */
export const WsAgentQuerySchema = z.object({
  type: z.literal("agent_query"),
  sessionId: z.string().min(1),
  query: z.string().min(1).max(2000),
  pageContext: z.record(z.unknown()).optional(),
  siteConfig: z.record(z.unknown()).optional(),
  addToCartSelector: z.string().optional(),
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

/** Phase 1.1.5 — wizard paste-URL Shopify slice */
export const ShopifyQuickOnboardSchema = z.object({
  shopUrl: z.string().min(1).max(500),
  /** Public Shopify Storefront API token (NOT OAuth — Phase 1.3 adds OAuth). */
  storefrontToken: z.string().min(1).max(200),
  /** Optional: override max products ingested in this pass. */
  maxProducts: z.number().int().min(1).max(5000).optional(),
});

/**
 * Phase 1.4.3 — wizard paste-URL WooCommerce slice. Credentials optional:
 *   - Omit both → public Store API path (limited fields, no inventory).
 *   - Provide both → authenticated REST v3 path (richer data + inventory).
 */
export const WooCommerceQuickOnboardSchema = z.object({
  shopUrl: z.string().min(1).max(500),
  consumerKey: z.string().min(1).max(200).optional(),
  consumerSecret: z.string().min(1).max(200).optional(),
  maxProducts: z.number().int().min(1).max(5000).optional(),
}).refine(
  (v) => (v.consumerKey == null && v.consumerSecret == null) ||
         (v.consumerKey != null && v.consumerSecret != null),
  { message: "consumerKey and consumerSecret must both be provided or both omitted" },
);

/**
 * Phase 1.5.3 — unified onboarding entrypoint. Accepts the union of fields
 * for all platforms; server detects the platform first and validates the
 * platform-specific subset itself. Wizard no longer needs to know which
 * platform's endpoint to call.
 */
export const QuickOnboardSchema = z.object({
  shopUrl: z.string().min(1).max(500),
  // Shopify path
  storefrontToken: z.string().min(1).max(200).optional(),
  // Woo REST v3 path (both or neither)
  consumerKey: z.string().min(1).max(200).optional(),
  consumerSecret: z.string().min(1).max(200).optional(),
  // Common
  maxProducts: z.number().int().min(1).max(5000).optional(),
}).refine(
  (v) => (v.consumerKey == null && v.consumerSecret == null) ||
         (v.consumerKey != null && v.consumerSecret != null),
  { message: "consumerKey and consumerSecret must both be provided or both omitted" },
);

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
export function validatePayload<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}
