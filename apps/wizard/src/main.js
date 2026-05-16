import "./styles.css";
import { createIntegrationWizard } from "./components/integration-wizard.js";
import { createShopifyQuickWizard } from "./components/shopify-quick.js";
import { createWooQuickWizard } from "./components/woo-quick.js";
import { createAutoQuickWizard } from "./components/auto-quick.js";
import { initAppBridge, isShopifyEmbedded, showToast } from "./app-bridge.js";

// Initialise Shopify App Bridge if running inside Shopify Admin.
// No-op in standalone / demo mode.
initAppBridge().catch(() => {});

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app root element");

// When embedded in Shopify Admin, suppress the standalone wizard shell
// (Shopify Admin provides its own chrome — header, nav, etc.)
if (!isShopifyEmbedded) {
  app.innerHTML = `
    <div class="wizard-shell">
      <header class="wizard-header">
        <p class="eyebrow">AVA</p>
        <h1>Integration Wizard</h1>
        <p class="subtext">Connect → Install → Analyze → Activate → Validate</p>
      </header>
      <section id="wizard-root"></section>
    </div>
  `;
} else {
  // Inside Shopify Admin: render without the branded header shell
  app.innerHTML = `<section id="wizard-root" class="shopify-embedded"></section>`;
}

const wizardRoot = document.getElementById("wizard-root");
if (!wizardRoot) throw new Error("Missing #wizard-root element");

// Phase 1.1.5 / 1.4.4 / 1.5.4 — route to a platform-specific quick-onboard
// flow when `?platform=...` is set; the unified auto-detect flow (1.5.4)
// when `?platform=auto`; otherwise the legacy multi-step wizard.
//
// Most paths in production should use ?platform=auto — the wizard then asks
// the server to detect the platform via the unified endpoint and renders the
// appropriate preview, so the user just pastes a URL.
const params = new URLSearchParams(window.location.search);
const platform = params.get("platform");

const onActivatedShared = (activation) => {
  showToast("AVA activated — your store is now being tracked.");
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: "ava:wizard:activated", payload: activation },
      "*",
    );
  }
};

const opts = { apiBaseUrl: "http://localhost:8080", onActivated: onActivatedShared };

if (platform === "shopify") {
  createShopifyQuickWizard(wizardRoot, opts);
} else if (platform === "woocommerce") {
  createWooQuickWizard(wizardRoot, opts);
} else if (platform === "auto") {
  createAutoQuickWizard(wizardRoot, opts);
} else {
  createIntegrationWizard(wizardRoot, opts);
}

// On wizard load, reset the demo store to dormant so every demo session starts clean.
// Skip in Shopify Admin (not a demo environment).
// Fire-and-forget — failure is non-critical (server may not be ready yet).
if (!isShopifyEmbedded) {
  fetch("http://localhost:8080/api/site/reset?siteUrl=" + encodeURIComponent("http://localhost:3001"), {
    method: "POST",
  })
    .then(() => {
      // Tell parent (demo at 4002) to reload the store so the widget hides
      if (window.parent !== window) {
        window.parent.postMessage({ type: "ava:wizard:reset" }, "*");
      }
    })
    .catch(() => { /* server may not be ready yet — harmless */ });
}
