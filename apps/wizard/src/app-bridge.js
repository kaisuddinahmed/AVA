// ============================================================================
// Shopify App Bridge adapter
//
// When the wizard runs inside Shopify Admin (embedded=1 or host= in URL),
// this module:
//   1. Waits for the App Bridge CDN script to load
//   2. Initialises the app with apiKey + host from URL params
//   3. Sets the Shopify Admin TitleBar to "AVA Setup"
//   4. Exports helpers: showToast(), redirect()
//
// When running standalone (dev demo, non-Shopify), all exports are no-ops.
// ============================================================================

const params = new URLSearchParams(window.location.search);

/** True when running inside Shopify Admin iframe. */
export const isShopifyEmbedded =
  params.get("embedded") === "1" || params.has("host");

let _app = null;
let _AppBridge = null;

/**
 * Initialise App Bridge. Call once on page load.
 * Safe to call in all environments — no-ops when not embedded.
 */
export async function initAppBridge() {
  if (!isShopifyEmbedded) return;

  // Wait for the CDN script to attach window.shopify (App Bridge 3.x)
  // or the legacy window.ShopifyApp (App Bridge 2.x).
  await waitForAppBridge();

  const host    = params.get("host") ?? "";
  const apiKey  = params.get("apiKey") ?? "";
  const shop    = params.get("shop") ?? "";

  // App Bridge 3.x (cdn.shopify.com/shopifycloud/app-bridge.js)
  if (window["shopify"]) {
    // App Bridge 3 initialises automatically from the data-api-key attribute
    // set on the <script> tag in index.html. No manual init needed.
    // We just reference it for toast/redirect actions.
    _AppBridge = window["shopify"];
    setTitleBar("AVA Setup");
    return;
  }

  // App Bridge 2.x fallback (older Shopify partners)
  if (window["ShopifyApp"] && apiKey && (host || shop)) {
    try {
      _AppBridge = window["ShopifyApp"];
      _app = _AppBridge.createApp({ apiKey, host: host || btoa(`admin.shopify.com/store/${shop}`) });
      const TitleBar = _AppBridge.actions?.TitleBar;
      if (TitleBar && _app) {
        TitleBar.create(_app, { title: "AVA Setup" });
      }
    } catch (e) {
      console.warn("[AppBridge] Init failed (non-critical):", e);
    }
  }
}

/** Set the Shopify Admin title bar text. No-op outside Shopify Admin. */
export function setTitleBar(title) {
  if (!isShopifyEmbedded || !_AppBridge) return;
  try {
    // App Bridge 3.x exposes document.title sync automatically;
    // we also set it directly for immediate effect.
    document.title = `${title} — Shopify`;

    // App Bridge 2.x TitleBar action
    if (_app && _AppBridge.actions?.TitleBar) {
      _AppBridge.actions.TitleBar.create(_app, { title });
    }
  } catch (e) { /* non-critical */ }
}

/**
 * Show a Shopify Admin toast notification.
 * Falls back to a plain console.info outside Shopify context.
 */
export function showToast(message, isError = false) {
  if (!isShopifyEmbedded || !_AppBridge) {
    if (isError) console.warn("[Toast]", message);
    else console.info("[Toast]", message);
    return;
  }
  try {
    // App Bridge 3.x
    if (window["shopify"]?.toast) {
      window["shopify"].toast.show(message, { isError, duration: 3000 });
      return;
    }
    // App Bridge 2.x
    if (_app && _AppBridge.actions?.Toast) {
      const toastNotice = _AppBridge.actions.Toast.create(_app, { message, isError, duration: 3000 });
      toastNotice.dispatch(_AppBridge.actions.Toast.Action.SHOW);
    }
  } catch (e) { /* non-critical */ }
}

/**
 * Navigate within Shopify Admin using App Bridge redirect.
 * Falls back to window.location.href outside Shopify context.
 */
export function navigateTo(url) {
  if (!isShopifyEmbedded || !_AppBridge) {
    window.location.href = url;
    return;
  }
  try {
    // App Bridge 3.x
    if (window["shopify"]?.navigate) {
      window["shopify"].navigate(url);
      return;
    }
    // App Bridge 2.x
    if (_app && _AppBridge.actions?.Redirect) {
      const redirect = _AppBridge.actions.Redirect.create(_app);
      redirect.dispatch(_AppBridge.actions.Redirect.Action.APP, url);
    }
  } catch (e) {
    window.location.href = url;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function waitForAppBridge(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (window["shopify"] || window["ShopifyApp"]) { resolve(); return; }
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      if (window["shopify"] || window["ShopifyApp"] || Date.now() > deadline) {
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });
}
