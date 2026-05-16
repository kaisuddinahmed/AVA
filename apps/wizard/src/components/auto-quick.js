// ============================================================================
// Auto-detect Quick Onboarding — single-screen paste-URL flow that hits the
// unified server endpoint and renders the appropriate preview based on the
// detected platform (Shopify / WooCommerce / generic).
//
// Phase 1.5.4. Replaces the platform-specific entry path: the wizard no
// longer needs ?platform=... to be set. The user pastes a URL, the server
// figures out which adapter to run.
//
// Reuses the sq-* CSS prefix from shopify-quick.js. Zero deps per CLAUDE.md.
//
// State machine:
//   input         → URL form (+ optional advanced auth)
//   loading       → POST /api/onboarding/quick in flight
//   needs_token   → server returned 400 'requires: [storefrontToken]'
//   preview       → 200 with platform-specific result
//   activated     → activation succeeded
//   error
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
const PLATFORM_LABEL = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  custom: "Custom / generic",
};

export function createAutoQuickWizard(root, options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? "http://localhost:8080";
  const onActivated = options.onActivated ?? (() => {});

  let state = {
    stage: "input",
    error: null,
    detection: null,
    result: null,
    busy: false,
    showAdvanced: false,
    // Carried across submissions so the user doesn't re-type after 400.
    shopUrl: "",
    storefrontToken: "",
    consumerKey: "",
    consumerSecret: "",
  };

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
      input: "Connect your store",
      loading: "Analyzing your store…",
      needs_token: "Shopify detected — we need your Storefront token",
      preview: "Site map ready",
      activated: "AVA is active",
      error: "Something went wrong",
    }[state.stage];
    return `<header class="sq-header"><h2>${escapeHtml(stageText)}</h2></header>`;
  }

  function stageBody() {
    switch (state.stage) {
      case "input":       return renderInputForm();
      case "loading":     return renderLoading();
      case "needs_token": return renderNeedsToken();
      case "preview":     return renderPreview();
      case "activated":   return renderActivated();
      case "error":       return renderError();
      default:            return "";
    }
  }

  function renderInputForm() {
    return `
      <p class="sq-subtext">
        Paste your shop URL. We'll auto-detect the platform (Shopify, WooCommerce,
        or generic) and fetch a preview. No changes are made until you click
        <strong>Activate</strong>.
      </p>
      <form id="sq-form" class="sq-form" autocomplete="off">
        <label class="sq-field">
          <span>Shop URL</span>
          <input id="sq-shop-url" type="text" placeholder="example.com" required
                 value="${escapeHtml(state.shopUrl)}" />
        </label>

        <label class="sq-field sq-field--toggle">
          <input id="sq-toggle-advanced" type="checkbox" ${state.showAdvanced ? "checked" : ""} />
          <span>Advanced — provide credentials in advance</span>
        </label>

        ${state.showAdvanced ? `
          <label class="sq-field">
            <span>Shopify Storefront token (optional)</span>
            <input id="sq-storefront-token" type="password" placeholder="shpat_…"
                   value="${escapeHtml(state.storefrontToken)}" />
            <small>Only used if AVA detects a Shopify store.</small>
          </label>
          <label class="sq-field">
            <span>WooCommerce consumer key (optional)</span>
            <input id="sq-ck" type="text" placeholder="ck_…"
                   value="${escapeHtml(state.consumerKey)}" />
          </label>
          <label class="sq-field">
            <span>WooCommerce consumer secret (optional)</span>
            <input id="sq-cs" type="password" placeholder="cs_…"
                   value="${escapeHtml(state.consumerSecret)}" />
            <small>Pair with consumer key for richer Woo data.</small>
          </label>
        ` : ""}

        <button type="submit" class="sq-btn sq-btn--primary">Analyze store</button>
      </form>
    `;
  }

  function renderLoading() {
    return `
      <div class="sq-loading">
        <div class="sq-spinner" aria-hidden="true"></div>
        <p>Detecting platform, fetching products, walking sitemap…</p>
        <small>Shopify usually completes &lt;5min, WooCommerce &lt;10min.</small>
      </div>
    `;
  }

  function renderNeedsToken() {
    return `
      <p class="sq-subtext">
        We detected a <strong>Shopify</strong> store at
        <code>${escapeHtml(state.shopUrl)}</code>. To preview the catalog,
        paste a public Storefront API access token. Create one in Shopify
        admin under Apps → Develop apps → Configure Storefront API access.
      </p>
      <form id="sq-form-token" class="sq-form" autocomplete="off">
        <label class="sq-field">
          <span>Storefront API token</span>
          <input id="sq-storefront-token" type="password" placeholder="shpat_…" required
                 value="${escapeHtml(state.storefrontToken)}" />
        </label>
        <div class="sq-actions">
          <button type="submit" class="sq-btn sq-btn--primary">Try again</button>
          <button type="button" id="sq-restart" class="sq-btn sq-btn--ghost">Start over</button>
        </div>
      </form>
    `;
  }

  function renderPreview() {
    const { result } = state;
    if (!result) return "";
    const platformLabel = PLATFORM_LABEL[result.platform] ?? result.platform;
    const transportLine = result.transport
      ? `<p class="sq-subtext"><strong>Detected:</strong> ${escapeHtml(platformLabel)} · <strong>Transport:</strong> ${escapeHtml(result.transport)}</p>`
      : `<p class="sq-subtext"><strong>Detected:</strong> ${escapeHtml(platformLabel)}</p>`;

    const pageTypes = PAGE_TYPE_ORDER
      .map((t) => [t, result.sitemap?.byPageType?.[t]])
      .filter(([, m]) => m && m.count > 0);

    // Generic-path-specific stats.
    const products = result.products ?? {};
    const coveragePct = typeof products.coverage === "number"
      ? Math.round(products.coverage * 100) : null;
    const isGeneric = result.platform === "custom";

    return `
      <div class="sq-preview">
        ${transportLine}

        <div class="sq-summary-grid">
          <div class="sq-stat">
            <span class="sq-stat__value">${products.ingested ?? 0}</span>
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

        ${isGeneric ? renderGenericCoverage(products, coveragePct) : ""}

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

  function renderGenericCoverage(products, coveragePct) {
    const bySource = products.bySource ?? {};
    const total = (bySource.jsonld || 0) + (bySource.microdata || 0)
      + (bySource.opengraph || 0) + (bySource.llm || 0);
    if (total === 0) return "";
    return `
      <div class="sq-coverage">
        <h3 class="sq-h3">Generic extraction coverage</h3>
        <p class="sq-subtext">
          ${coveragePct ?? 0}% of detected PDP pages produced a product row
          (${products.extractedCount ?? 0} of ${products.pdpCount ?? 0}).
        </p>
        <ul class="sq-source-breakdown">
          ${bySource.jsonld     ? `<li>JSON-LD: <strong>${bySource.jsonld}</strong></li>` : ""}
          ${bySource.microdata  ? `<li>Microdata: <strong>${bySource.microdata}</strong></li>` : ""}
          ${bySource.opengraph  ? `<li>OpenGraph: <strong>${bySource.opengraph}</strong></li>` : ""}
          ${bySource.llm        ? `<li>LLM fallback: <strong>${bySource.llm}</strong></li>` : ""}
        </ul>
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
          Open your dashboard to watch sessions arrive.
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
    const tokenForm = root.querySelector("#sq-form-token");
    if (tokenForm) tokenForm.addEventListener("submit", onAnalyzeWithToken);
    const toggle = root.querySelector("#sq-toggle-advanced");
    if (toggle) toggle.addEventListener("change", (e) => {
      transition({ showAdvanced: e.target.checked });
    });
    const activateBtn = root.querySelector("#sq-activate");
    if (activateBtn) activateBtn.addEventListener("click", onActivate);
    const restartBtn = root.querySelector("#sq-restart");
    if (restartBtn) restartBtn.addEventListener("click", () => {
      state = {
        stage: "input", error: null, detection: null, result: null,
        busy: false, showAdvanced: false,
        shopUrl: "", storefrontToken: "", consumerKey: "", consumerSecret: "",
      };
      render();
    });
    const retryBtn = root.querySelector("#sq-retry");
    if (retryBtn) retryBtn.addEventListener("click", () => transition({ stage: "input", error: null }));
  }

  function collectBody() {
    const body = { shopUrl: state.shopUrl };
    if (state.storefrontToken) body.storefrontToken = state.storefrontToken;
    if (state.consumerKey)     body.consumerKey = state.consumerKey;
    if (state.consumerSecret)  body.consumerSecret = state.consumerSecret;
    return body;
  }

  async function onAnalyze(e) {
    e.preventDefault();
    const shopUrl = root.querySelector("#sq-shop-url").value.trim();
    if (!shopUrl) return;
    const storefrontToken = root.querySelector("#sq-storefront-token")?.value.trim() ?? "";
    const consumerKey     = root.querySelector("#sq-ck")?.value.trim() ?? "";
    const consumerSecret  = root.querySelector("#sq-cs")?.value.trim() ?? "";

    if ((consumerKey && !consumerSecret) || (consumerSecret && !consumerKey)) {
      transition({ stage: "error", error: "Provide both Woo consumer key AND secret, or leave both blank." });
      return;
    }

    state = { ...state, shopUrl, storefrontToken, consumerKey, consumerSecret };
    await runAnalyze();
  }

  async function onAnalyzeWithToken(e) {
    e.preventDefault();
    const token = root.querySelector("#sq-storefront-token").value.trim();
    if (!token) return;
    state = { ...state, storefrontToken: token };
    await runAnalyze();
  }

  async function runAnalyze() {
    transition({ stage: "loading", error: null });
    try {
      const resp = await fetch(`${apiBaseUrl}/api/onboarding/quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectBody()),
      });
      const body = await resp.json().catch(() => ({}));

      if (resp.status === 400 && Array.isArray(body?.requires) && body.requires.includes("storefrontToken")) {
        transition({ stage: "needs_token", detection: body.detection ?? null });
        return;
      }
      if (!resp.ok) {
        transition({ stage: "error", error: friendlyError(resp.status, body) });
        return;
      }
      transition({ stage: "preview", result: body });
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

  function transition(patch) {
    state = { ...state, ...patch };
    render();
  }

  function friendlyError(status, body) {
    if (body?.kind === "unauthorized") return "Credentials rejected. Double-check the token / consumer key/secret and try again.";
    if (body?.kind === "forbidden")    return "Access denied. The credentials lack the required scopes.";
    if (body?.kind === "not_found")    return "Endpoint not found. The site may not run a supported platform.";
    if (body?.kind === "rate_limited") return "Rate-limited by upstream. Wait a few seconds and retry.";
    if (status === 502) return body?.detail ? `Could not reach the URL: ${body.detail}` : "Could not reach the URL.";
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
  return { destroy() { root.innerHTML = ""; } };
}
