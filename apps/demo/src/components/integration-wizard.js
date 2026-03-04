const POLL_INTERVAL_MS = 3000;

export function createIntegrationWizard(root, options) {
  const state = {
    apiBaseUrl: options.apiBaseUrl,
    siteUrl: "http://localhost:3001",
    mode: "auto",
    notes: "",
    runId: "",
    siteId: "",
    run: null,
    metrics: null,
    coverage: null,
    verification: null,
    activation: null,
    latestStatus: null,
    loading: false,
    polling: false,
    error: "",
    message: "Ready. Start analysis to begin onboarding.",
  };

  let pollTimer = null;

  const setState = (patch) => {
    Object.assign(state, patch);
    render();
  };

  const api = async (path, init = {}) => {
    const response = await fetch(`${state.apiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = typeof data?.error === "string" ? data.error : "Request failed";
      throw new Error(details);
    }
    return data;
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    setState({ polling: false });
  };

  const startPolling = () => {
    stopPolling();
    pollTimer = setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);
    setState({ polling: true });
    void refreshStatus();
  };

  const refreshStatus = async () => {
    if (!state.runId) return;
    try {
      const status = await api(`/api/onboarding/${state.runId}/status`);
      setState({
        run: status.run,
        siteId: status.site?.id ?? state.siteId,
        metrics: status.metrics,
        latestStatus: status.latestStatus ?? null,
        error: "",
      });

      const isTerminal =
        status.run?.status === "completed" || status.run?.status === "failed";
      if (isTerminal) {
        stopPolling();
        await refreshResults();
      }
    } catch (error) {
      stopPolling();
      setState({
        error: toMessage(error),
      });
    }
  };

  const refreshResults = async () => {
    if (!state.runId) return;
    try {
      const results = await api(`/api/onboarding/${state.runId}/results?limit=30`);
      setState({
        coverage: results.coverage ?? null,
        latestStatus: results.latestStatus ?? state.latestStatus,
      });
    } catch (error) {
      setState({ error: toMessage(error) });
    }
  };

  const onStart = async () => {
    if (!state.siteUrl.trim()) {
      setState({ error: "Site URL is required." });
      return;
    }

    setState({
      loading: true,
      error: "",
      message: "Starting onboarding run...",
      verification: null,
      activation: null,
    });

    try {
      const result = await api("/api/onboarding/start", {
        method: "POST",
        body: { siteUrl: state.siteUrl.trim() },
      });

      setState({
        runId: result.runId,
        siteId: result.siteId,
        loading: false,
        message: `Run ${result.runId} started.`,
      });
      startPolling();
    } catch (error) {
      setState({
        loading: false,
        error: toMessage(error),
      });
    }
  };

  const onVerify = async () => {
    if (!state.siteId) {
      setState({ error: "No siteId found. Start analysis first." });
      return;
    }

    setState({
      loading: true,
      error: "",
      message: "Running verification...",
    });

    try {
      const verification = await api(`/api/integration/${state.siteId}/verify`, {
        method: "POST",
        body: { runId: state.runId || undefined },
      });

      setState({
        loading: false,
        verification,
        message: `Verification complete. Recommended mode: ${verification.recommendedMode}.`,
      });
      await refreshResults();
    } catch (error) {
      setState({
        loading: false,
        error: toMessage(error),
      });
    }
  };

  const onActivate = async () => {
    if (!state.siteId) {
      setState({ error: "No siteId found. Start analysis first." });
      return;
    }

    setState({
      loading: true,
      error: "",
      message: "Activating integration...",
    });

    try {
      const activation = await api(`/api/integration/${state.siteId}/activate`, {
        method: "POST",
        body: {
          mode: state.mode,
          notes: state.notes || undefined,
        },
      });

      setState({
        loading: false,
        activation,
        message: `Integration is now ${activation.mode}.`,
      });

      if (options.onActivated) {
        options.onActivated(activation);
      }

      await refreshStatus();
    } catch (error) {
      setState({
        loading: false,
        error: toMessage(error),
      });
    }
  };

  const onInput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "siteUrlInput" && target instanceof HTMLInputElement) {
      setState({ siteUrl: target.value });
    }
    if (target.id === "modeSelect" && target instanceof HTMLSelectElement) {
      setState({ mode: target.value });
    }
    if (target.id === "activationNotes" && target instanceof HTMLTextAreaElement) {
      setState({ notes: target.value });
    }
  };

  const onClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest("[data-action]");
    if (!(button instanceof HTMLButtonElement)) return;

    const action = button.dataset.action;
    if (action === "start") {
      void onStart();
      return;
    }
    if (action === "refresh") {
      void refreshStatus();
      return;
    }
    if (action === "verify") {
      void onVerify();
      return;
    }
    if (action === "activate") {
      void onActivate();
    }
  };

  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);

  const getStepState = () => {
    const status = state.run?.status ?? "";
    const verificationDone = Boolean(state.verification);
    const activationDone = Boolean(state.activation);

    const done = new Set();
    // Analyze = done when pipeline has started (any status beyond empty)
    if (status && status !== "queued") done.add("analyze");
    // Map = done only when pipeline has fully completed mapping
    if (status === "completed") done.add("map");
    // Verify = done only when user explicitly ran verify
    if (verificationDone) done.add("verify");
    // Activate = done when activation succeeded
    if (activationDone) done.add("activate");

    return done;
  };

  const coveragePct = (value, total) => {
    if (!value || !total) return "0%";
    return `${Math.round((value / total) * 100)}%`;
  };

  const render = () => {
    const done = getStepState();
    const behaviorMapped =
      state.coverage?.behaviorMapped ?? state.metrics?.behaviorMapped ?? 0;
    const behaviorTarget =
      state.coverage?.behaviorTarget ?? state.metrics?.behaviorTarget ?? 614;
    const frictionMapped =
      state.coverage?.frictionMapped ?? state.metrics?.frictionMapped ?? 0;
    const frictionTarget =
      state.coverage?.frictionTarget ?? state.metrics?.frictionTarget ?? 325;
    const avgConf = state.run?.avgConfidence ?? 0;

    // Verify button requires mapping to be complete
    const mappingDone = state.run?.status === "completed";
    // Activate button requires verification to be done
    const verifyDone = Boolean(state.verification);

    root.innerHTML = `
      <section class="wizard-card">
        <label for="siteUrlInput">Store URL</label>
        <div class="row">
          <input id="siteUrlInput" type="text" value="${escapeHtml(state.siteUrl)}" placeholder="https://store.example" />
          <button data-action="start" ${state.loading ? "disabled" : ""}>Analyze</button>
        </div>
        <p class="micro">Run ID: ${state.runId || "not started"}</p>
      </section>

      <section class="wizard-card">
        <h3>Flow</h3>
        <ol class="steps">
          ${renderStep("Analyze", done.has("analyze"), state.run?.status || "pending")}
          ${renderStep("Map", done.has("map"), mappingDone ? "completed" : state.run?.phase || "pending")}
          ${renderStep("Verify", done.has("verify"), state.verification?.recommendedMode || "pending")}
          ${renderStep("Activate", done.has("activate"), state.activation?.mode || "pending")}
        </ol>
        <div class="row compact">
          <button data-action="refresh" ${state.loading || !state.runId ? "disabled" : ""}>Refresh</button>
          <span class="badge">${state.polling ? "Polling..." : "Idle"}</span>
        </div>
      </section>

      <section class="wizard-card">
        <h3>Mapping Snapshot</h3>
        <div class="metric-grid">
          <div class="metric">
            <span>Behaviors</span>
            <strong>${behaviorMapped}/${behaviorTarget}</strong>
            <small>${coveragePct(behaviorMapped, behaviorTarget)} mapped</small>
          </div>
          <div class="metric">
            <span>Frictions</span>
            <strong>${frictionMapped}/${frictionTarget}</strong>
            <small>${coveragePct(frictionMapped, frictionTarget)} mapped</small>
          </div>
          <div class="metric">
            <span>Confidence</span>
            <strong>${avgConf ? (avgConf * 100).toFixed(0) + "%" : "—"}</strong>
            <small>avg score</small>
          </div>
        </div>
      </section>

      <section class="wizard-card">
        <div class="row compact">
          <h3>Verification</h3>
          <button data-action="verify" ${state.loading || !mappingDone ? "disabled" : ""}>Run Verify</button>
        </div>
        <p class="micro">
          Recommended mode: <strong>${escapeHtml(state.verification?.recommendedMode || "not verified")}</strong>
        </p>
      </section>

      <section class="wizard-card">
        <h3>Activation</h3>
        <label for="modeSelect">Mode</label>
        <select id="modeSelect" ${state.loading || !verifyDone ? "disabled" : ""}>
          ${renderModeOption("auto", state.mode, "Auto (recommended)")}
          ${renderModeOption("limited_active", state.mode, "Limited Active")}
          ${renderModeOption("active", state.mode, "Active")}
        </select>
        <label for="activationNotes">Notes</label>
        <textarea id="activationNotes" rows="3" placeholder="Optional notes for this activation">${escapeHtml(state.notes)}</textarea>
        <button data-action="activate" ${state.loading || !verifyDone ? "disabled" : ""}>Activate</button>
        <p class="micro">
          Current mode: <strong>${escapeHtml(state.activation?.mode || "not active")}</strong>
        </p>
      </section>

      <section class="wizard-card status ${state.error ? "is-error" : "is-ok"}">
        <h3>Status</h3>
        <p>${escapeHtml(state.error || state.message)}</p>
      </section>
    `;
  };

  render();

  return {
    destroy() {
      stopPolling();
      root.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
    },
  };
}

function renderStep(label, done, detail) {
  return `<li class="${done ? "done" : ""}">
    <span class="dot">${done ? "✓" : "•"}</span>
    <div>
      <strong>${label}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  </li>`;
}

function renderModeOption(value, selected, label) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function toMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
