import { AVAWidget } from "./ava.js";
import { initShopAssist } from "./tracker/initializer.js";
import type { WidgetConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./config.js";

declare global {
  interface Window {
    ShopAssistConfig: Partial<WidgetConfig>;
    __AVA_CONFIG__: Partial<WidgetConfig>;
    ShopAssist: {
      init: (config: Partial<WidgetConfig>) => Promise<{ widget: AVAWidget | null }>;
    };
  }
}

/**
 * Checks whether this site has been activated via the AVA integration wizard.
 * Returns true  → proceed and mount the widget.
 * Returns false → site not yet activated; stay completely dormant.
 *
 * If serverUrl or siteUrl are not configured (dev/demo without the gate),
 * this returns true so the widget still works in local development.
 */
/**
 * Checks whether this site has been activated via the AVA integration wizard.
 * Returns true  → proceed and mount the widget.
 * Returns false → site not yet activated; stay completely dormant.
 *
 * When siteKey is provided the server validates that the key matches the
 * configured siteUrl, preventing spoofing via siteUrl alone.
 *
 * If serverUrl or siteUrl are not configured (dev/demo without the gate),
 * this returns true so the widget still works in local development.
 */
async function checkActivationGate(
  serverUrl: string,
  siteUrl: string,
  siteKey?: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ siteUrl });
    if (siteKey) params.set("siteKey", siteKey);
    const url = `${serverUrl}/api/site/status?${params.toString()}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json() as { status: string; activated: boolean };
    return data.activated === true;
  } catch {
    // Network error / server unreachable — fail safe: stay dormant
    return false;
  }
}

/**
 * Generate or retrieve a persistent anonymous visitor ID for this browser.
 * Stored in localStorage so the same visitor is recognised across page loads.
 * Falls back to a one-time random ID when localStorage is unavailable.
 * No PII — purely an anonymous fingerprint.
 */
function getOrCreateVisitorId(): string {
  const KEY = "ava_visitor_id";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const id = "vis_" + Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private browsing / blocked storage — ephemeral ID for this page load
    return "vis_" + Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

async function init(config: Partial<WidgetConfig>): Promise<{ widget: AVAWidget | null }> {
  const fullConfig: WidgetConfig = { ...DEFAULT_CONFIG, ...config };

  // Ensure every visitor gets a stable anonymous ID. Never ship with the empty
  // default — an empty sessionId causes all visitors to share the same server
  // session cache entry, breaking session isolation and event attribution.
  if (!fullConfig.sessionId) {
    fullConfig.sessionId = getOrCreateVisitorId();
  }

  // ── Activation gate ──────────────────────────────────────────────────────────
  // If serverUrl is configured, always check activation.
  // siteUrl auto-falls back to window.location.origin so merchants don't need to set it.
  if (fullConfig.serverUrl) {
    const effectiveSiteUrl = fullConfig.siteUrl || window.location.origin;
    const activated = await checkActivationGate(
      fullConfig.serverUrl,
      effectiveSiteUrl,
      fullConfig.siteKey,
    );
    if (!activated) {
      // Site not yet activated — no DOM, no WebSocket, complete silence.
      return { widget: null };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Create host element
  let hostEl = document.getElementById("ava-widget-root");
  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.id = "ava-widget-root";
    document.body.appendChild(hostEl);
  }

  // Create Shadow DOM for style isolation
  const shadow = hostEl.attachShadow({ mode: "open" });

  // Create widget
  const widget = new AVAWidget(shadow, fullConfig);
  widget.mount();

  // Initialize tracker
  const { bridge, collector } = initShopAssist(fullConfig);

  // Wire bridge interventions to widget
  bridge.on("intervention", (payload: any) => {
    widget.handleIntervention(payload);
  });

  // Wire widget outcomes back to bridge (flat intervention_outcome format)
  widget.onDismiss = (id: string) => {
    bridge.sendOutcome(id, "dismissed");
  };
  widget.onConvert = (id: string, action: string) => {
    bridge.sendOutcome(id, "converted", action);
  };
  widget.onIgnored = (id: string) => {
    bridge.sendOutcome(id, "ignored");
  };
  // Voice muted: user tapped 🔇 — server marks session as voiceMuted
  widget.onVoiceMuted = (id: string) => {
    bridge.sendOutcome(id, "voice_muted");
  };
  // Feedback: thumbs up/down — sent as intervention_feedback WS message
  widget.onFeedback = (id: string, feedback: "helpful" | "not_helpful") => {
    bridge.sendFeedback(id, feedback);
  };
  // Micro-outcomes: sent as track events so they pass server Zod validation
  widget.onMicroOutcome = (id: string, outcome: string) => {
    bridge.sendTrackEvent({
      event_type: "micro_outcome",
      friction_id: null,
      raw_signals: { outcome, intervention_id: id },
    });
  };
  // Text chat input — routes through voice_query pipeline so server generates an LLM reply
  widget.onUserMessage = (text: string) => {
    bridge.sendVoiceQuery(text);
  };
  widget.onUserAction = (action: string, data?: Record<string, unknown>) => {
    bridge.sendTrackEvent({
      event_type: "user_action",
      raw_signals: { action, ...data },
    });
  };
  // Phase 2: ASR voice query — send transcript to server for LLM reply + voice playback
  widget.onVoiceQuery = (transcript: string) => {
    bridge.sendVoiceQuery(transcript);
  };
  // Clear typing state if voice query is rejected (disabled / error path)
  bridge.on("voice_query_ack", (data: any) => {
    widget.handleVoiceQueryAck(data);
  });
  // Clear typing state on server-side error (voice_query_error message type)
  bridge.on("voice_query_error", () => {
    widget.handleVoiceQueryAck({ status: "error" });
  });

  // Expose for debug
  (window as any).__AVA_WIDGET__ = widget;
  (window as any).__AVA_BRIDGE__ = bridge;
  (window as any).__AVA_COLLECTOR__ = collector;

  return { widget };
}

// Expose global API
window.ShopAssist = { init };

// Auto-init if config present
if (window.__AVA_CONFIG__ || window.ShopAssistConfig) {
  const config = window.__AVA_CONFIG__ || window.ShopAssistConfig;
  init(config).catch(() => { /* startup failure — stay silent */ });
}
