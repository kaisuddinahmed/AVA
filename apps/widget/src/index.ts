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
  widget.onUserMessage = (text: string) => {
    bridge.send("user_message", { text });
  };
  widget.onUserAction = (action: string, data?: Record<string, unknown>) => {
    bridge.send("user_action", { action, data });
  };

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
