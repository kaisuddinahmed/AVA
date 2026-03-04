import { AVAWidget } from "./ava.js";
import { initShopAssist } from "./tracker/initializer.js";
import type { WidgetConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./config.js";

declare global {
  interface Window {
    ShopAssistConfig: Partial<WidgetConfig>;
    __AVA_CONFIG__: Partial<WidgetConfig>;
    ShopAssist: {
      init: (config: Partial<WidgetConfig>) => { widget: AVAWidget };
    };
  }
}

function init(config: Partial<WidgetConfig>) {
  const fullConfig: WidgetConfig = { ...DEFAULT_CONFIG, ...config };

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
  init(config);
}
