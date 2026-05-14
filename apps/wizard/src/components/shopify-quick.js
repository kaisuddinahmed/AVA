// ============================================================================
// Shopify Quick Onboarding — single-screen paste-URL flow.
// Phase 1.1.5.
//
// Flow: paste shop URL + Storefront token → POST /api/onboarding/shopify-quick
//       → render preview (product count, pageType breakdown, top PDPs)
//       → Activate button → POST /api/integration/:siteId/activate
//
// Zero-dep vanilla JS (per CLAUDE.md — apps/wizard has no React).
// Mirrors the existing integration-wizard.js patterns: postMessage on
// activation, friendly error messages, no localStorage (server-of-record).
// ============================================================================

const PAGE_TYPE_ORDER = ["pdp", "category", "cart", "checkout", "home", "search_results", "account"];
const PAGE_TYPE_LABEL = {
  pdp: "Product pages",
  category: "Category pages",
  cart: "Cart",
  checkout: "Checkout",
  home: "Homepage",
  search_results: "Search results",
  account: "Account",
};

export function createShopifyQuickWizard(root, options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? "http://localhost:8080";
  const onActivated = options.onActivated ?? (() => {});

  let state = { stage: "input", error: null, result: null, busy: false };

  function render() {
    root.innerHTML = `
      <div class="sq-card">
        ${stageHeader()}
        ${stageBody()}
      </div>
    `;
    wireEvents();
  }

  function stageHeader() {
    const stageText = {
      input: "Connect your Shopify store",
      loading: "Analyzing your store…",
      preview: "Site map ready",
      activated: "AVA is active",
      error: "Something went wrong",
    }[state.stage];
    return `<header class="sq-header"><h2>${escapeHtml(stageText)}</h2></header>`;
  }

  function stageBody() {
    switch (state.stage) {
      case "input":     return renderInputForm();
      case "loading":   return renderLoading();
      case "preview":   return renderPreview();
      case "activated": return renderActivated();
      case "error":     return renderError();
      default:          return "";
    }
  }

  function renderInputForm() {
    return `
      <p class="sq-subtext">
        Paste your shop URL and a Storefront API access token. We'll fetch your
        catalog + sitemap and show you what AVA can detect — no changes made
        until you click <strong>Activate</strong>.
      </p>
      <form id="sq-form" class="sq-form" autocomplete="off">
        <label class="sq-field">
          <span>Shop URL</span>
          <input id="sq-shop-url" type="text" placeholder="example.myshopify.com" required />
        </label>
        <label class="sq-field">
          <span>Storefront API token</span>
          <input id="sq-token" type="password" placeholder="shpat_… (public Storefront token)" required />
          <small>Create one in Shopify admin under Apps → Develop apps → Configure Storefront API access.</small>
        </label>
        <button type="submit" class="sq-btn sq-btn--primary">Analyze store</button>
      </form>
    `;
  }

  function renderLoading() {
    return `
      <div class="sq-loading">
        <div class="sq-spinner" aria-hidden="true"></div>
        <p>Fetching products, walking sitemap, classifying pages…</p>
        <small>Cold-start usually completes in &lt;5 minutes.</small>
      </div>
    `;
  }

  function renderPreview() {
    const { result } = state;
    if (!result) return "";
    const pageTypes = PAGE_TYPE_ORDER
      .map((t) => [t, result.sitemap?.byPageType?.[t]])
      .filter(([, m]) => m && m.count > 0);

    return `
      <div class="sq-preview">
        <div class="sq-summary-grid">
          <div class="sq-stat">
            <span class="sq-stat__value">${result.products?.ingested ?? 0}</span>
            <span class="sq-stat__label">Products ingested</span>
          </div>
          <div class="sq-stat">
            <span class="sq-stat__value">${result.sitemap?.classifiedUrls ?? 0}</span>
            <span class="sq-stat__label">Pages mapped</span>
          </div>
          <div class="sq-stat">
            <span class="sq-stat__value">${formatDuration(result.durationMs)}</span>
            <span class="sq-stat__label">Cold-start time</span>
          </div>
        </div>

        <h3 class="sq-h3">Page types detected</h3>
        ${pageTypes.length === 0
          ? `<p class="sq-empty">No sitemap pages classified yet. AVA will still track via the widget snippet.</p>`
          : `<ul class="sq-pagetype-list">
              ${pageTypes.map(([t, m]) => renderPageTypeRow(t, m)).join("")}
            </ul>`
        }

        <div class="sq-actions">
          <button type="button" id="sq-activate" class="sq-btn sq-btn--primary"
                  ${state.busy ? "disabled" : ""}>
            ${state.busy ? "Activating…" : "Activate AVA"}
          </button>
          <button type="button" id="sq-restart" class="sq-btn sq-btn--ghost"
                  ${state.busy ? "disabled" : ""}>
            Start over
          </button>
        </div>
      </div>
    `;
  }

  function renderPageTypeRow(pageType, mapping) {
    const confPct = Math.round((mapping.confidence ?? 0) * 100);
    const samples = (mapping.samples ?? []).slice(0, 3);
    return `
      <li class="sq-pagetype">
        <div class="sq-pagetype__head">
          <span class="sq-pagetype__label">${PAGE_TYPE_LABEL[pageType] ?? pageType}</span>
          <span class="sq-pagetype__count">${mapping.count}</span>
        </div>
        <div class="sq-pagetype__meta">
          <code class="sq-pagetype__pattern">${escapeHtml(mapping.urlPattern || "—")}</code>
          <span class="sq-pagetype__conf" aria-label="Mapping confidence">
            <span class="sq-pagetype__conf-bar" style="width:${confPct}%"></span>
            <span class="sq-pagetype__conf-text">${confPct}% confidence</span>
          </span>
        </div>
        ${samples.length > 0
          ? `<ul class="sq-pagetype__samples">
              ${samples.map((s) => `<li><a href="${escapeHtml(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a></li>`).join("")}
            </ul>`
          : ""}
      </li>
    `;
  }

  function renderActivated() {
    return `
      <div class="sq-activated">
        <p class="sq-activated__msg">✅ AVA is now tracking <code>${escapeHtml(state.result?.siteUrl ?? "")}</code></p>
        <p class="sq-subtext">
          The widget is live on your storefront. Open your dashboard to watch sessions arrive.
        </p>
      </div>
    `;
  }

  function renderError() {
    return `
      <div class="sq-error">
        <p class="sq-error__msg">${escapeHtml(state.error ?? "Unknown error")}</p>
        <button type="button" id="sq-retry" class="sq-btn sq-btn--ghost">Try again</button>
      </div>
    `;
  }

  // ── Event wiring ─────────────────────────────────────────────────────────

  function wireEvents() {
    const form = root.querySelector("#sq-form");
    if (form) form.addEventListener("submit", onAnalyze);
    const activateBtn = root.querySelector("#sq-activate");
    if (activateBtn) activateBtn.addEventListener("click", onActivate);
    const restartBtn = root.querySelector("#sq-restart");
    if (restartBtn) restartBtn.addEventListener("click", () => transition({ stage: "input", error: null, result: null }));
    const retryBtn = root.querySelector("#sq-retry");
    if (retryBtn) retryBtn.addEventListener("click", () => transition({ stage: "input", error: null }));
  }

  async function onAnalyze(e) {
    e.preventDefault();
    const shopUrl = root.querySelector("#sq-shop-url").value.trim();
    const storefrontToken = root.querySelector("#sq-token").value.trim();
    if (!shopUrl || !storefrontToken) return;

    transition({ stage: "loading", error: null });

    try {
      const resp = await fetch(`${apiBaseUrl}/api/onboarding/shopify-quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopUrl, storefrontToken }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        transition({ stage: "error", error: friendlyError(resp.status, body) });
        return;
      }
      const result = await resp.json();
      transition({ stage: "preview", result });
    } catch (err) {
      transition({ stage: "error", error: `Network error: ${err.message}` });
    }
  }

  async function onActivate() {
    if (!state.result || state.busy) return;
    if (!state.result.siteId) {
      transition({ stage: "error", error: "Activation is missing a site ID. Re-run analysis and try again." });
      return;
    }
    transition({ busy: true });
    try {
      // Existing activation endpoint owned by the wizard (per CLAUDE.md).
      const resp = await fetch(
        `${apiBaseUrl}/api/integration/${encodeURIComponent(state.result.siteId)}/activate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "limited_active" }) },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        transition({ busy: false, stage: "error", error: friendlyError(resp.status, body) });
        return;
      }
      const activation = await resp.json().catch(() => ({}));
      transition({ stage: "activated", busy: false });
      onActivated({ siteUrl: state.result.siteUrl, activation });
    } catch (err) {
      transition({ busy: false, stage: "error", error: `Activation failed: ${err.message}` });
    }
  }

  // ── State machine ────────────────────────────────────────────────────────

  function transition(patch) {
    state = { ...state, ...patch };
    render();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function friendlyError(status, body) {
    if (body?.kind === "unauthorized") return "Storefront API token is invalid. Generate a new one in Shopify admin and try again.";
    if (body?.kind === "forbidden")    return "Token lacks Storefront API scopes. Re-grant the `unauthenticated_read_product_listings` scope.";
    if (body?.kind === "not_found")    return "Shop not found at that URL. Double-check the .myshopify.com subdomain.";
    if (body?.kind === "rate_limited") return "Shopify rate-limited us. Wait a few seconds and try again.";
    if (status === 400 && body?.detection?.platform && body.detection.platform !== "shopify") {
      return `That doesn't look like a Shopify store (detected: ${body.detection.platform}).`;
    }
    return body?.error ?? `Request failed (HTTP ${status}).`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return "—";
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  render();

  return {
    destroy() { root.innerHTML = ""; },
  };
}
