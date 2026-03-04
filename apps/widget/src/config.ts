export interface WidgetConfig {
  position: "bottom-right" | "bottom-left";
  brandColor: string;
  brandColorLight: string;
  accentColor: string;
  fontFamily: string;
  websocketUrl: string;
  sessionId: string;
  userId: string | null;
  zIndex: number;
  assistantName: string;
  maxCardsToShow: number;
  animationDuration: number;
  avatarUrl?: string;
  // CSS custom property overrides for host-site theming
  cssVars?: {
    primaryColor?: string;
    fontFamily?: string;
    borderRadius?: string;
  };
  // Activation gate — widget stays completely dormant until the site is activated
  siteUrl?: string;              // canonical URL of the host store (e.g. "http://localhost:3001")
  // Voice settings (Phase 1 Deepgram TTS — server sends voice_script, widget plays it)
  voiceEnabled?: boolean;        // merchant-level toggle (default: false)
  voiceMaxPerSession?: number;   // session budget ceiling (default: 3, enforced server-side)
  serverUrl?: string;            // AVA server base URL for voice proxy (e.g. "http://localhost:8080")
  /** @deprecated Use serverUrl — widget now routes TTS/STT through the AVA server proxy */
  deepgramApiKey?: string;
  deepgramModel?: string;        // Deepgram voice model (default: "aura-asteria-en")
  voiceAutoPlay?: boolean;       // autoplay on intervention or require tap (default: true)
}

export const DEFAULT_CONFIG: WidgetConfig = {
  position: "bottom-right",
  brandColor: "#1A1A2E",
  brandColorLight: "#16213E",
  accentColor: "#E94560",
  fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  websocketUrl: "wss://ava-server.localhost/ws/assistant",
  sessionId: "",
  userId: null,
  zIndex: 99999,
  assistantName: "AVA",
  maxCardsToShow: 3,
  animationDuration: 300,
  voiceEnabled: false,
  voiceMaxPerSession: 3,
  deepgramModel: "aura-asteria-en",
  voiceAutoPlay: true,
};

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
  differing_attributes: { label: string; values: [string, string] }[];
  recommendation?: { product_id: string; reason: string };
}

export interface UIAdjustment {
  adjustment_type: string;
  target_selector?: string;
  params: Record<string, any>;
}

export interface InterventionPayload {
  type: "passive" | "nudge" | "active" | "escalate";
  intervention_id: string;
  action_code: string;
  // friction_id that triggered this intervention (e.g. "F068", "F400")
  friction_id?: string;
  message?: string;
  products?: ProductCard[];
  comparison?: ComparisonCard;
  ui_adjustment?: UIAdjustment;
  cta_label?: string;
  cta_action?: string;
  meta?: Record<string, any>;
  // Voice fields (server sets these; Phase 1 widget plays via Deepgram TTS)
  voice_enabled?: boolean;
  voice_script?: string;
}

export interface WidgetMessage {
  id: string;
  type: "assistant" | "user" | "system";
  content: string;
  payload?: InterventionPayload;
  timestamp: number;
}

// --- Widget state machine ---
// minimized : toggle button only, invisible unless signaling
// signal    : button has expanded label strip, nudge is live — brief invite
// expanded  : full decision-cockpit panel is open
// hidden    : completely removed from view (passive-only mode)
export type WidgetState = "minimized" | "signal" | "expanded" | "hidden";

// --- Outcome micro-signal types ---
export type MicroOutcome =
  | "not_helpful"       // explicit negative feedback on intervention
  | "more_like_this"    // preference signal on a product card
  | "soft_dismiss"      // swipe/gesture away = "not now"
  | "hard_dismiss";     // explicit × = "stop showing these"
