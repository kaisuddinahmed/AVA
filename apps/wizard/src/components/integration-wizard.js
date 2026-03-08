import { SCENARIO_REGISTRY } from "./scenario-registry.js";
import {
  BEHAVIOR_CATEGORY_BY_ID,
  BEHAVIOR_CATEGORY_CATALOG,
  BEHAVIOR_CATEGORY_PACKS,
  BEHAVIOR_SUBCATEGORY_BY_ID,
} from "./behavior-taxonomy.js";
import {
  FRICTION_CATEGORY_BY_ID,
  FRICTION_CATEGORY_CATALOG,
  FRICTION_CATEGORY_PACKS,
  FRICTION_SUBCATEGORY_BY_ID,
} from "./friction-taxonomy.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const INSTALL_POLL_INTERVAL_MS = 5000;
const SCENARIO_TARGETS = { behavior: 614, friction: 325 };
const SPEED_MULTIPLIER = { fast: 0.65, normal: 1, slow: 1.6 };

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createIntegrationWizard(root, options) {

  // ── Scenario index maps ────────────────────────────────────────────────────
  const scenarioCoverageSets = {
    behaviorPlanned: new Set(),
    frictionPlanned: new Set(),
    frictionDetected: new Set(),
  };
  const pendingScenarioRuns = new Map();
  const runnableScenariosByBehaviorId = new Map();
  const runnableScenariosByFrictionId = new Map();

  for (const s of SCENARIO_REGISTRY) {
    for (const bid of s.behaviorIds || []) {
      if (!runnableScenariosByBehaviorId.has(bid)) runnableScenariosByBehaviorId.set(bid, []);
      runnableScenariosByBehaviorId.get(bid).push(s);
    }
    for (const fid of s.frictionIds || []) {
      if (!runnableScenariosByFrictionId.has(fid)) runnableScenariosByFrictionId.set(fid, []);
      runnableScenariosByFrictionId.get(fid).push(s);
    }
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    apiBaseUrl: options.apiBaseUrl,

    // Step 1 — Connect
    siteUrl: "",

    // Step 2 — Tag / Install
    siteKey: "",
    siteId: "",
    snippet: "",
    snippetTab: "script",     // script | shopify | gtm | webflow
    snippetCopied: false,
    installStatus: "not_found", // not_found | found_unverified | verified_ready
    installLastChecked: 0,

    // Step 3 — Analyze
    runId: "",
    run: null,
    metrics: null,
    coverage: null,

    // Step 4 — Activate
    activation: null,

    // Wizard navigation
    wizardStep: "connect",  // connect | snippet | analyzing | mapped | activating | active
    loading: false,
    polling: false,
    installPolling: false,
    error: "",
    message: "",

    // Scenario control
    scenarioStoreReady: false,
    scenarioStoreMeta: null,
    scenarioPackId: BEHAVIOR_CATEGORY_PACKS[0]?.id || "",
    scenarioSelectedId: BEHAVIOR_CATEGORY_PACKS[0]?.behaviorIds?.[0] || "",
    frictionPackId: "",
    frictionSelectedId: "",
    scenarioSpeed: "normal",
    scenarioRepeat: 1,
    scenarioRunning: false,
    scenarioStopRequested: false,
    scenarioLastRunId: "",
    scenarioMessage: "Waiting for store runner...",
    scenarioLog: [],
    scenarioResults: [],
    scenarioCoverage: {
      behaviorPlanned: [],
      frictionPlanned: [],
      frictionDetected: [],
    },
    mappingValidationOverlay: { behaviorMapped: 0, frictionMapped: 0, syncedAt: 0 },
  };

  let pollTimer = null;
  let installPollTimer = null;
  let scenarioHeartbeatTimer = null;

  // ── Core helpers ───────────────────────────────────────────────────────────

  const setState = (patch) => { Object.assign(state, patch); render(); };

  const api = async (path, init = {}) => {
    const res = await fetch(`${state.apiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "Request failed");
    }
    return data;
  };

  // ── Snippet builder ────────────────────────────────────────────────────────

  const buildSnippet = (tab, siteKey, _siteUrl) => {
    const wsUrl = state.apiBaseUrl.replace(/^http/, "ws").replace("8080", "8081");
    // siteUrl is intentionally omitted from the snippet — the widget auto-detects
    // window.location.origin at runtime. This means the snippet only activates on
    // the domain it was installed on; copying it to another site won't work because
    // the origin won't match the registered siteUrl in the server DB.
    const config = JSON.stringify({
      siteKey,
      serverUrl: state.apiBaseUrl,
      websocketUrl: wsUrl,
      position: "bottom-right",
      brandColor: "#000000",
      accentColor: "#35d3a1",
    }, null, 4).replace(/^/gm, "  ");

    const scriptSrc = `${state.apiBaseUrl}/api/widget.js`;

    if (tab === "shopify") {
      return `{{- '<!-- AVA Shopping Assistant -->' -}}
<script>
  window.__AVA_CONFIG__ = ${config};
</script>
<script src="${scriptSrc}" async></script>

{{- '<!-- Paste above before </body> in theme.liquid -->' -}}`;
    }
    if (tab === "gtm") {
      return `<!-- Google Tag Manager — Custom HTML tag, fire on All Pages -->
<script>
  window.__AVA_CONFIG__ = ${config};
</script>
<script src="${scriptSrc}" async></script>`;
    }
    if (tab === "webflow") {
      return `<!-- Project Settings → Custom Code → Before </body> tag -->
<script>
  window.__AVA_CONFIG__ = ${config};
</script>
<script src="${scriptSrc}" async></script>`;
    }
    // Default: plain HTML
    return `<!-- AVA Shopping Assistant — paste before </body> -->
<script>
  window.__AVA_CONFIG__ = ${config};
</script>
<script src="${scriptSrc}" async></script>`;
  };

  // ── Step 1: Generate ───────────────────────────────────────────────────────

  const onGenerate = async () => {
    const url = state.siteUrl.trim();
    if (!url) { setState({ error: "Enter a valid website URL first." }); return; }

    setState({ loading: true, error: "", message: "Generating install tag…" });
    try {
      const result = await api("/api/integration/generate", {
        method: "POST",
        body: { siteUrl: url },
      });

      const canonicalSiteUrl = result.siteUrl || url;
      const snippet = buildSnippet(state.snippetTab, result.siteKey, canonicalSiteUrl);
      setState({
        siteUrl: canonicalSiteUrl,
        siteKey: result.siteKey,
        siteId: result.siteId,
        snippet,
        wizardStep: "snippet",
        loading: false,
        message: "Tag generated. Install it on your website.",
      });
      startInstallPoll();
    } catch (err) {
      setState({ loading: false, error: toMessage(err) });
    }
  };

  // ── Step 2: Install detection ──────────────────────────────────────────────

  const startInstallPoll = () => {
    stopInstallPoll();
    installPollTimer = setInterval(() => { void checkInstallStatus(); }, INSTALL_POLL_INTERVAL_MS);
    setState({ installPolling: true });
    void checkInstallStatus();
  };

  const stopInstallPoll = () => {
    if (installPollTimer) { clearInterval(installPollTimer); installPollTimer = null; }
    setState({ installPolling: false });
  };

  const checkInstallStatus = async () => {
    if (!state.siteKey) return;
    try {
      const result = await api(
        `/api/integration/${encodeURIComponent(state.siteKey)}/install-status`,
      );
      const prev = state.installStatus;
      const next = result.status; // not_found | found_unverified | verified_ready
      setState({ installStatus: next, installLastChecked: Date.now() });
      if (next === "verified_ready" && prev !== "verified_ready") {
        stopInstallPoll();
        setState({ message: "Tag confirmed! Click Analyze to begin." });
      } else if (next === "found_unverified" && prev === "not_found") {
        setState({ message: "Tag detected — waiting for more events to confirm…" });
      }
    } catch {
      // network error — keep polling silently
    }
  };

  // ── Step 3: Analyze ────────────────────────────────────────────────────────

  const onAnalyze = async () => {
    setState({
      loading: true,
      error: "",
      message: "Starting analysis…",
      wizardStep: "analyzing",
      run: null,
      metrics: null,
      coverage: null,
      runId: "",
    });
    try {
      const result = await api("/api/onboarding/start", {
        method: "POST",
        body: { siteUrl: state.siteUrl.trim() },
      });
      setState({ runId: result.runId, siteId: result.siteId || state.siteId, loading: false });
      startPolling();
    } catch (err) {
      setState({ loading: false, error: toMessage(err), wizardStep: "snippet" });
    }
  };

  // ── Analysis polling ───────────────────────────────────────────────────────

  const stopPolling = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    setState({ polling: false });
  };

  const startPolling = () => {
    stopPolling();
    pollTimer = setInterval(() => { void refreshStatus(); }, POLL_INTERVAL_MS);
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
        error: "",
      });
      const isTerminal = status.run?.status === "completed" || status.run?.status === "failed";
      if (isTerminal) {
        stopPolling();
        await refreshResults();
        setState({ wizardStep: "mapped", message: "Analysis complete. Ready to activate." });
      }
    } catch (err) {
      stopPolling();
      setState({ error: toMessage(err) });
    }
  };

  const refreshResults = async () => {
    if (!state.runId) return;
    try {
      const results = await api(`/api/onboarding/${state.runId}/results?limit=30`);
      setState({ coverage: results.coverage ?? null });
    } catch { /* non-fatal */ }
  };

  // ── Step 4: Activate ───────────────────────────────────────────────────────

  const onActivate = async () => {
    if (!state.siteId) { setState({ error: "No site ID. Run analysis first." }); return; }
    setState({ loading: true, error: "", message: "Activating…", wizardStep: "activating" });
    try {
      const activation = await api(`/api/integration/${state.siteId}/activate`, {
        method: "POST",
        body: { mode: "auto" },
      });
      setState({
        loading: false,
        activation,
        wizardStep: "active",
        message: `Integration is ${activation.mode}.`,
      });
      if (options.onActivated) options.onActivated(activation);
      startScenarioHeartbeat();
    } catch (err) {
      setState({ loading: false, error: toMessage(err), wizardStep: "mapped" });
    }
  };

  // ── Scenario control: store messaging ─────────────────────────────────────
  // When embedded in the demo iframe, we proxy postMessages through window.parent.
  // When standalone, we try to find a store frame directly (fallback).

  const postToStore = (type, payload = {}) => {
    const msg = { source: "ava-demo-scenario", type, payload };
    if (window.parent !== window) {
      // Embedded: ask parent to forward to store iframe
      window.parent.postMessage({ type: "ava:proxy:to-store", payload: msg }, "*");
    } else {
      // Standalone fallback (scenario control will show offline without store)
      const frame = document.querySelector('iframe[title="Demo Store"]');
      const target = frame?.contentWindow;
      if (!target) throw new Error("Store frame is unavailable.");
      target.postMessage(msg, "*");
    }
  };

  const handleStoreMessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.source !== "ava-store-scenario") return;
    const payload = msg.payload || {};

    if (msg.type === "ava:scenario:ready") {
      const ver = payload.version || "v1";
      const changed = state.scenarioStoreMeta?.version !== ver || !state.scenarioStoreReady;
      if (!changed) return;
      setState({ scenarioStoreReady: true, scenarioStoreMeta: payload, scenarioMessage: `Store runner ready (${ver})` });
      return;
    }
    if (msg.type === "ava:scenario:step") {
      const s = payload?.step || {};
      addScenarioLog(
        `${payload.runId || "run"} :: step ${s.index ?? "?"} ${s.action || ""}`,
        s.status === "failed" ? "error" : "info",
      );
      return;
    }
    if (msg.type === "ava:scenario:reset:complete") {
      addScenarioLog("Store reset complete", "ok"); return;
    }
    if (msg.type === "ava:scenario:run:complete") {
      settlePendingRun(payload.runId, payload, null); return;
    }
    if (msg.type === "ava:scenario:run:error") {
      settlePendingRun(payload.runId, null, new Error(payload.error || "Scenario run failed."));
    }
  };

  window.addEventListener("message", handleStoreMessage);

  const sendScenarioPing = () => {
    try {
      postToStore("ava:scenario:ping", { ts: Date.now() });
    } catch {
      if (state.scenarioStoreReady) {
        setState({ scenarioStoreReady: false, scenarioStoreMeta: null, scenarioMessage: "Runner Offline" });
      }
    }
  };

  const startScenarioHeartbeat = () => {
    if (scenarioHeartbeatTimer) clearInterval(scenarioHeartbeatTimer);
    scenarioHeartbeatTimer = setInterval(sendScenarioPing, 4000);
    sendScenarioPing();
  };

  const stopScenarioHeartbeat = () => {
    if (scenarioHeartbeatTimer) { clearInterval(scenarioHeartbeatTimer); scenarioHeartbeatTimer = null; }
  };

  const settlePendingRun = (runId, data, error) => {
    const p = pendingScenarioRuns.get(runId);
    if (!p) return;
    clearTimeout(p.timeoutId);
    pendingScenarioRuns.delete(runId);
    error ? p.reject(error) : p.resolve(data);
  };

  const waitForRunCompletion = (runId, timeoutMs) =>
    new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingScenarioRuns.delete(runId);
        reject(new Error(`Scenario run timeout (${runId})`));
      }, timeoutMs);
      pendingScenarioRuns.set(runId, { resolve, reject, timeoutId });
    });

  // ── Scenario log ───────────────────────────────────────────────────────────

  const addScenarioLog = (message, level = "info") => {
    const entry = { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), message, level };
    setState({ scenarioLog: [entry, ...state.scenarioLog].slice(0, 120) });
  };

  // ── Coverage helpers ───────────────────────────────────────────────────────

  const updateScenarioCoverageState = () => {
    setState({
      scenarioCoverage: {
        behaviorPlanned: [...scenarioCoverageSets.behaviorPlanned].sort(),
        frictionPlanned: [...scenarioCoverageSets.frictionPlanned].sort(),
        frictionDetected: [...scenarioCoverageSets.frictionDetected].sort(),
      },
    });
  };

  const syncScenarioCoverageToMappingSnapshot = () => {
    const baseBMapped = state.coverage?.behaviorMapped ?? state.metrics?.behaviorMapped ?? 0;
    const baseFMapped = state.coverage?.frictionMapped ?? state.metrics?.frictionMapped ?? 0;
    setState({
      mappingValidationOverlay: {
        behaviorMapped: Math.max(baseBMapped, scenarioCoverageSets.behaviorPlanned.size),
        frictionMapped: Math.max(baseFMapped, Math.max(scenarioCoverageSets.frictionPlanned.size, scenarioCoverageSets.frictionDetected.size)),
        syncedAt: Date.now(),
      },
    });
  };

  const registerCoverage = (scenario, evidence, overrides = null) => {
    const behaviorIds = overrides?.behaviorIds ?? scenario.behaviorIds ?? [];
    const frictionIds = overrides?.frictionIds ?? scenario.frictionIds ?? [];
    for (const bid of behaviorIds) scenarioCoverageSets.behaviorPlanned.add(bid);
    for (const fid of frictionIds) scenarioCoverageSets.frictionPlanned.add(fid);
    for (const fid of evidence.detectedFrictionIds || []) scenarioCoverageSets.frictionDetected.add(fid);
    updateScenarioCoverageState();
    syncScenarioCoverageToMappingSnapshot();
  };

  // ── Evidence collection ────────────────────────────────────────────────────

  const SCENARIO_STORE_URL = "http://localhost:3001";

  const captureBaseline = async () => {
    try {
      const sr = await api(`/api/sessions?siteUrl=${encodeURIComponent(SCENARIO_STORE_URL)}`);
      const session = (Array.isArray(sr.sessions) ? sr.sessions : [])[0] || null;
      if (!session?.id) return null;
      const er = await api(`/api/sessions/${session.id}/events?limit=500`);
      return { sessionId: session.id, beforeEventCount: Array.isArray(er.events) ? er.events.length : 0 };
    } catch { return null; }
  };

  const collectEvidence = async ({ scenario, runStartedAt, baseline }) => {
    try {
      const sr = await api(`/api/sessions?siteUrl=${encodeURIComponent(SCENARIO_STORE_URL)}`);
      const session = (Array.isArray(sr.sessions) ? sr.sessions : [])[0] || null;
      if (!session?.id) return emptyEvidence();

      const sinceIso = runStartedAt.toISOString();
      const [er, ar] = await Promise.all([
        api(`/api/sessions/${session.id}/events?since=${encodeURIComponent(sinceIso)}&limit=500`),
        api(`/api/analytics/session/${session.id}`),
      ]);

      const events = Array.isArray(er.events) ? er.events : [];
      const eventTypes = [...new Set(events.map((e) => e.eventType).filter(Boolean))];
      const frictionFromEvents = events.map((e) => e.frictionId).filter((f) => typeof f === "string" && f.length > 0);
      const frictionFromAnalytics = Object.keys(ar?.frictionBreakdown || {}).filter(Boolean);
      const detectedFrictionIds = [...new Set([...frictionFromEvents, ...frictionFromAnalytics])].sort();
      const matchedExpectedFrictions = (scenario.frictionIds || []).filter((fid) => detectedFrictionIds.includes(fid));

      const beforeEventCount = baseline?.sessionId === session.id ? baseline.beforeEventCount || 0 : 0;
      const allEr = await api(`/api/sessions/${session.id}/events?limit=500`);
      const allEvents = Array.isArray(allEr.events) ? allEr.events : [];

      return {
        sessionId: session.id,
        eventCount: events.length,
        eventTypes,
        detectedFrictionIds,
        matchedExpectedFrictions,
        interventionCount: Number(ar?.outcomeBreakdown?.total || 0),
        newEventsVsBaseline: Math.max(0, allEvents.length - beforeEventCount),
      };
    } catch { return emptyEvidence(); }
  };

  const emptyEvidence = () => ({
    sessionId: null, eventCount: 0, eventTypes: [], detectedFrictionIds: [],
    matchedExpectedFrictions: [], interventionCount: 0, newEventsVsBaseline: 0,
  });

  const buildVerdict = (scenario, storeRun, evidence) => {
    const expectedEvents = scenario.assertions?.expectedEventTypes || [];
    const expectedMinEvents = Number(scenario.assertions?.minEventCount || 1);
    const hasExpectedEvents = expectedEvents.length === 0 || expectedEvents.some((e) => evidence.eventTypes.includes(e));
    const hasExpectedFriction = scenario.frictionIds.length === 0 || evidence.matchedExpectedFrictions.length > 0;
    const minEventsReached = evidence.eventCount >= expectedMinEvents;
    const storeSucceeded = Boolean(storeRun?.success);

    let status = "failed";
    if (storeSucceeded && minEventsReached && hasExpectedEvents && hasExpectedFriction) status = "passed";
    else if (storeSucceeded && (minEventsReached || hasExpectedEvents)) status = "partial";

    return { status, checks: { storeSucceeded, minEventsReached, hasExpectedEvents, hasExpectedFriction } };
  };

  // ── Scenario lookup helpers ────────────────────────────────────────────────

  const getPrimaryScenarioForBehavior = (bid) => runnableScenariosByBehaviorId.get(bid)?.[0] || null;
  const getPrimaryScenarioForFriction = (fid) => runnableScenariosByFrictionId.get(fid)?.[0] || null;

  const getScenariosForBehaviorCategory = (catId) => {
    const cat = BEHAVIOR_CATEGORY_BY_ID.get(catId);
    if (!cat) return [];
    const unique = new Map();
    for (const item of cat.items) {
      for (const s of runnableScenariosByBehaviorId.get(item.id) || []) {
        if (!unique.has(s.id)) unique.set(s.id, s);
      }
    }
    return [...unique.values()];
  };

  const getScenariosForFrictionCategory = (catId) => {
    const cat = FRICTION_CATEGORY_BY_ID.get(catId);
    if (!cat) return [];
    const unique = new Map();
    for (const item of cat.items) {
      for (const s of runnableScenariosByFrictionId.get(item.id) || []) {
        if (!unique.has(s.id)) unique.set(s.id, s);
      }
    }
    return [...unique.values()];
  };

  const getFirstBehaviorIdForPack = (packId) => BEHAVIOR_CATEGORY_BY_ID.get(packId)?.items?.[0]?.id || "";
  const getFirstFrictionIdForPack = (packId) => FRICTION_CATEGORY_BY_ID.get(packId)?.items?.[0]?.id || "";

  // ── Scenario run logic ─────────────────────────────────────────────────────

  const resetStoreScenarioState = async () => {
    try {
      postToStore("ava:scenario:reset", { source: "wizard" });
      await delay(350);
    } catch { /* no-op */ }
  };

  const runScenario = async (scenario, context = {}) => {
    const runId = `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    const baseline = await captureBaseline();

    setState({ scenarioLastRunId: runId, scenarioMessage: `Running ${scenario.name}…` });
    addScenarioLog(`Run ${runId} started: ${scenario.name}`, "info");

    try {
      await resetStoreScenarioState();
      const speed = SPEED_MULTIPLIER[state.scenarioSpeed] || 1;
      postToStore("ava:scenario:run", {
        runId, scenarioId: scenario.id, steps: scenario.steps,
        injectors: scenario.injectors || {}, delayMultiplier: speed, meta: context,
      });

      const timeoutMs = Math.max(30000, (scenario.steps.length * 4000 + 15000) * speed);
      const storeRun = await waitForRunCompletion(runId, timeoutMs);
      const evidence = await collectEvidence({ scenario, runStartedAt: startedAt, baseline });
      const verdict = buildVerdict(scenario, storeRun, evidence);
      registerCoverage(scenario, evidence, context.coverageOverride || null);

      const record = {
        runId, scenarioId: scenario.id, scenarioName: scenario.name,
        startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
        verdict: verdict.status, expectedFrictions: scenario.frictionIds,
        detectedFrictions: evidence.detectedFrictionIds,
        matchedFrictions: evidence.matchedExpectedFrictions,
        eventCount: evidence.eventCount, interventionCount: evidence.interventionCount,
        checks: verdict.checks, storeRun, evidence,
      };

      setState({
        scenarioResults: [record, ...state.scenarioResults].slice(0, 40),
        scenarioMessage: `${scenario.name}: ${verdict.status.toUpperCase()}`,
      });
      addScenarioLog(
        `${scenario.name} → ${verdict.status.toUpperCase()} (${evidence.eventCount} events, ${evidence.matchedExpectedFrictions.length}/${scenario.frictionIds.length} frictions)`,
        verdict.status === "passed" ? "ok" : verdict.status === "partial" ? "warn" : "error",
      );
      await refreshStatus();
      return record;
    } catch (err) {
      addScenarioLog(`${scenario.name} failed: ${toMessage(err)}`, "error");
      const failed = {
        runId, scenarioId: scenario.id, scenarioName: scenario.name,
        startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
        verdict: "failed", expectedFrictions: scenario.frictionIds,
        detectedFrictions: [], matchedFrictions: [], eventCount: 0, interventionCount: 0,
        checks: { storeSucceeded: false, minEventsReached: false, hasExpectedEvents: false, hasExpectedFriction: false },
        error: toMessage(err),
      };
      setState({ scenarioResults: [failed, ...state.scenarioResults].slice(0, 40), scenarioMessage: `${scenario.name}: FAILED` });
      await refreshStatus();
      return failed;
    }
  };

  const runManualBehaviorSelection = async (behavior, context = {}) => {
    const runId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerCoverage({ behaviorIds: [behavior.id], frictionIds: [] }, { detectedFrictionIds: [] });
    const record = {
      runId, scenarioId: behavior.id, scenarioName: `${behavior.id} — ${behavior.label}`,
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      verdict: "manual", expectedFrictions: [], detectedFrictions: [], matchedFrictions: [],
      eventCount: 0, interventionCount: 0,
      checks: { storeSucceeded: false, minEventsReached: false, hasExpectedEvents: false, hasExpectedFriction: false },
      context,
    };
    setState({ scenarioResults: [record, ...state.scenarioResults].slice(0, 40), scenarioMessage: `Recorded ${behavior.id}.` });
    addScenarioLog(`${behavior.id} (${behavior.categoryLabel}) — no script yet; recorded for coverage.`, "warn");
    await refreshStatus();
    return record;
  };

  const runManualFrictionSelection = async (friction, context = {}) => {
    const runId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerCoverage({ behaviorIds: [], frictionIds: [friction.id] }, { detectedFrictionIds: [] });
    const record = {
      runId, scenarioId: friction.id, scenarioName: `${friction.id} — ${friction.label}`,
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      verdict: "manual", expectedFrictions: [friction.id], detectedFrictions: [], matchedFrictions: [],
      eventCount: 0, interventionCount: 0,
      checks: { storeSucceeded: false, minEventsReached: false, hasExpectedEvents: false, hasExpectedFriction: false },
      context,
    };
    setState({ scenarioResults: [record, ...state.scenarioResults].slice(0, 40), scenarioMessage: `Recorded ${friction.id}.` });
    addScenarioLog(`${friction.id} (${friction.categoryLabel}) — no script yet; recorded for coverage.`, "warn");
    await refreshStatus();
    return record;
  };

  // ── Scenario action handlers ───────────────────────────────────────────────

  const onRunSingleScenario = async () => {
    if (state.scenarioRunning) return;
    const behavior = BEHAVIOR_SUBCATEGORY_BY_ID.get(state.scenarioSelectedId);
    if (!behavior) { setState({ scenarioMessage: "Select a valid subcategory first." }); return; }
    const scenario = getPrimaryScenarioForBehavior(behavior.id);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    setState({ scenarioRunning: true, scenarioStopRequested: false, scenarioMessage: `Queued ${behavior.id} ×${repeat}`, frictionSelectedId: "", frictionPackId: "" });
    for (let i = 0; i < repeat; i++) {
      if (state.scenarioStopRequested) break;
      if (scenario) {
        await runScenario(scenario, { mode: "single", selectedBehaviorId: behavior.id, selectedBehaviorLabel: behavior.label, repeatIndex: i + 1, repeatTotal: repeat, coverageOverride: { behaviorIds: [behavior.id], frictionIds: [] } });
      } else {
        await runManualBehaviorSelection(behavior, { mode: "single", repeatIndex: i + 1, repeatTotal: repeat });
      }
    }
    setState({ scenarioRunning: false, scenarioStopRequested: false });
  };

  const onRunScenarioPack = async () => {
    if (state.scenarioRunning) return;
    const cat = BEHAVIOR_CATEGORY_BY_ID.get(state.scenarioPackId);
    if (!cat) { setState({ scenarioMessage: "Select a valid behavior pack first." }); return; }
    const catBehaviorIds = cat.items.map((i) => i.id);
    const scenarios = getScenariosForBehaviorCategory(state.scenarioPackId);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    setState({ scenarioRunning: true, scenarioStopRequested: false, scenarioMessage: `Running pack ${cat.label}`, scenarioSelectedId: getFirstBehaviorIdForPack(cat.id), frictionSelectedId: "", frictionPackId: "" });
    registerCoverage({ behaviorIds: catBehaviorIds, frictionIds: [] }, { detectedFrictionIds: [] });
    if (scenarios.length === 0) {
      addScenarioLog(`${cat.label}: no automated scripts yet; recorded for coverage.`, "warn");
    } else {
      outer: for (const s of scenarios) {
        const bids = (s.behaviorIds || []).filter((bid) => catBehaviorIds.includes(bid));
        for (let i = 0; i < repeat; i++) {
          if (state.scenarioStopRequested) break outer;
          await runScenario(s, { mode: "pack", packId: state.scenarioPackId, repeatIndex: i + 1, repeatTotal: repeat, coverageOverride: { behaviorIds: bids, frictionIds: s.frictionIds || [] } });
        }
      }
    }
    setState({ scenarioRunning: false, scenarioStopRequested: false, scenarioMessage: `${cat.label} pack done.` });
  };

  const onRunSingleFrictionScenario = async () => {
    if (state.scenarioRunning) return;
    const friction = FRICTION_SUBCATEGORY_BY_ID.get(state.frictionSelectedId);
    if (!friction) { setState({ scenarioMessage: "Select a valid friction subcategory first." }); return; }
    const scenario = getPrimaryScenarioForFriction(friction.id);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    setState({ scenarioRunning: true, scenarioStopRequested: false, scenarioMessage: `Queued ${friction.id} ×${repeat}`, frictionPackId: friction.categoryId, scenarioSelectedId: "", scenarioPackId: "" });
    for (let i = 0; i < repeat; i++) {
      if (state.scenarioStopRequested) break;
      if (scenario) {
        await runScenario(scenario, { mode: "single-friction", selectedFrictionId: friction.id, selectedFrictionLabel: friction.label, repeatIndex: i + 1, repeatTotal: repeat, coverageOverride: { behaviorIds: [], frictionIds: [friction.id] } });
      } else {
        await runManualFrictionSelection(friction, { mode: "single-friction", repeatIndex: i + 1, repeatTotal: repeat });
      }
    }
    setState({ scenarioRunning: false, scenarioStopRequested: false });
  };

  const onRunFrictionPack = async () => {
    if (state.scenarioRunning) return;
    const cat = FRICTION_CATEGORY_BY_ID.get(state.frictionPackId);
    if (!cat) { setState({ scenarioMessage: "Select a valid friction pack first." }); return; }
    const catFrictionIds = cat.items.map((i) => i.id);
    const scenarios = getScenariosForFrictionCategory(state.frictionPackId);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    setState({ scenarioRunning: true, scenarioStopRequested: false, scenarioMessage: `Running friction pack ${cat.label}`, frictionSelectedId: getFirstFrictionIdForPack(cat.id), scenarioSelectedId: "", scenarioPackId: "" });
    registerCoverage({ behaviorIds: [], frictionIds: catFrictionIds }, { detectedFrictionIds: [] });
    if (scenarios.length === 0) {
      addScenarioLog(`${cat.label}: no automated scripts yet; recorded for coverage.`, "warn");
    } else {
      outer: for (const s of scenarios) {
        const fids = (s.frictionIds || []).filter((fid) => catFrictionIds.includes(fid));
        for (let i = 0; i < repeat; i++) {
          if (state.scenarioStopRequested) break outer;
          await runScenario(s, { mode: "pack-friction", packId: state.frictionPackId, repeatIndex: i + 1, repeatTotal: repeat, coverageOverride: { behaviorIds: [], frictionIds: fids } });
        }
      }
    }
    setState({ scenarioRunning: false, scenarioStopRequested: false, scenarioMessage: `${cat.label} friction pack done.` });
  };

  const onStopScenario = () => {
    if (!state.scenarioRunning) return;
    setState({ scenarioStopRequested: true, scenarioMessage: "Stop requested…" });
    try { postToStore("ava:scenario:stop", { runId: state.scenarioLastRunId || null }); } catch { /* no-op */ }
  };

  const onExportScenarioResults = async () => {
    if (!state.scenarioResults.length) { setState({ scenarioMessage: "No results to export yet." }); return; }
    const payload = {
      generatedAt: new Date().toISOString(), siteUrl: state.siteUrl,
      summary: {
        totalRuns: state.scenarioResults.length,
        passed: state.scenarioResults.filter((r) => r.verdict === "passed").length,
        partial: state.scenarioResults.filter((r) => r.verdict === "partial").length,
        failed: state.scenarioResults.filter((r) => r.verdict === "failed").length,
        behaviorPlanned: state.scenarioCoverage.behaviorPlanned.length,
        frictionPlanned: state.scenarioCoverage.frictionPlanned.length,
        frictionDetected: state.scenarioCoverage.frictionDetected.length,
      },
      results: state.scenarioResults,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = `ava-scenario-evidence-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
    setState({ scenarioMessage: "Evidence exported." });
  };

  // ── Input / click dispatch ─────────────────────────────────────────────────

  const onInput = (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "siteUrlInput" && t instanceof HTMLInputElement) setState({ siteUrl: t.value });
    if (t.id === "scenarioSelect" && t instanceof HTMLSelectElement) {
      const b = BEHAVIOR_SUBCATEGORY_BY_ID.get(t.value);
      setState({ scenarioSelectedId: t.value, scenarioPackId: b?.categoryId || "", frictionSelectedId: "", frictionPackId: "" });
    }
    if (t.id === "scenarioPackSelect" && t instanceof HTMLSelectElement) {
      setState({ scenarioPackId: t.value, scenarioSelectedId: getFirstBehaviorIdForPack(t.value), frictionSelectedId: "", frictionPackId: "" });
    }
    if (t.id === "frictionScenarioSelect" && t instanceof HTMLSelectElement) {
      const f = FRICTION_SUBCATEGORY_BY_ID.get(t.value);
      setState({ frictionSelectedId: t.value, frictionPackId: f?.categoryId || "", scenarioSelectedId: "", scenarioPackId: "" });
    }
    if (t.id === "frictionPackSelect" && t instanceof HTMLSelectElement) {
      setState({ frictionPackId: t.value, frictionSelectedId: getFirstFrictionIdForPack(t.value), scenarioSelectedId: "", scenarioPackId: "" });
    }
    if (t.id === "scenarioSpeedSelect" && t instanceof HTMLSelectElement) setState({ scenarioSpeed: t.value });
    if (t.id === "scenarioRepeatInput" && t instanceof HTMLInputElement) {
      setState({ scenarioRepeat: Math.max(1, Math.min(20, Number(t.value) || 1)) });
    }
  };

  const onClick = (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest("[data-action]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = btn.dataset.action;
    const actions = {
      "generate": () => void onGenerate(),
      "analyze": () => void onAnalyze(),
      "activate": () => void onActivate(),
      "copy-snippet": () => {
        navigator.clipboard.writeText(state.snippet).then(() => {
          setState({ snippetCopied: true });
          setTimeout(() => setState({ snippetCopied: false }), 2000);
        }).catch(() => {});
      },
      "snippet-tab-script":   () => setState({ snippetTab: "script",  snippet: buildSnippet("script",  state.siteKey, state.siteUrl) }),
      "snippet-tab-shopify":  () => setState({ snippetTab: "shopify", snippet: buildSnippet("shopify", state.siteKey, state.siteUrl) }),
      "snippet-tab-gtm":      () => setState({ snippetTab: "gtm",     snippet: buildSnippet("gtm",     state.siteKey, state.siteUrl) }),
      "snippet-tab-webflow":  () => setState({ snippetTab: "webflow", snippet: buildSnippet("webflow", state.siteKey, state.siteUrl) }),
      "check-install":        () => void checkInstallStatus(),
      "scenario-run":         () => void onRunSingleScenario(),
      "scenario-run-pack":    () => void onRunScenarioPack(),
      "scenario-run-friction":      () => void onRunSingleFrictionScenario(),
      "scenario-run-friction-pack": () => void onRunFrictionPack(),
      "scenario-stop":        () => onStopScenario(),
      "scenario-reset":       () => { void (async () => { try { postToStore("ava:scenario:reset", { source: "wizard" }); await delay(350); setState({ scenarioMessage: "Store reset sent." }); } catch (e) { setState({ scenarioMessage: `Reset failed: ${toMessage(e)}` }); } })(); },
      "scenario-export":      () => void onExportScenarioResults(),
      "scenario-ping":        () => sendScenarioPing(),
    };
    actions[action]?.();
  };

  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const pct = (v, t) => (v && t ? `${Math.round((v / t) * 100)}%` : "0%");

  const renderBehaviorOptions = () =>
    [`<option value="" ${!state.scenarioSelectedId ? "selected" : ""}>None</option>`,
      ...BEHAVIOR_CATEGORY_CATALOG.map((cat) =>
        `<optgroup label="${escapeHtml(cat.label)}">${cat.items.map((i) =>
          `<option value="${i.id}" ${i.id === state.scenarioSelectedId ? "selected" : ""}>${escapeHtml(`${i.id} — ${i.label}`)}</option>`).join("")}</optgroup>`)].join("");

  const renderBehaviorPackOptions = () =>
    [`<option value="" ${!state.scenarioPackId ? "selected" : ""}>None</option>`,
      ...BEHAVIOR_CATEGORY_PACKS.map((p) =>
        `<option value="${p.id}" ${p.id === state.scenarioPackId ? "selected" : ""}>${escapeHtml(`${p.label} (${p.behaviorIds.length})`)}</option>`)].join("");

  const renderFrictionOptions = () =>
    [`<option value="" ${!state.frictionSelectedId ? "selected" : ""}>None</option>`,
      ...FRICTION_CATEGORY_CATALOG.map((cat) =>
        `<optgroup label="${escapeHtml(cat.label)}">${cat.items.map((i) =>
          `<option value="${i.id}" ${i.id === state.frictionSelectedId ? "selected" : ""}>${escapeHtml(`${i.id} — ${i.label}`)}</option>`).join("")}</optgroup>`)].join("");

  const renderFrictionPackOptions = () =>
    [`<option value="" ${!state.frictionPackId ? "selected" : ""}>None</option>`,
      ...FRICTION_CATEGORY_PACKS.map((p) =>
        `<option value="${p.id}" ${p.id === state.frictionPackId ? "selected" : ""}>${escapeHtml(`${p.label} (${p.frictionIds.length})`)}</option>`)].join("");

  const renderRecentResults = () => {
    if (!state.scenarioResults.length) return `<div class="scenario-empty">No runs yet.</div>`;
    return state.scenarioResults.slice(0, 8).map((r) => {
      const cls = r.verdict === "passed" ? "pill pill--ok" : r.verdict === "partial" ? "pill pill--warn" : r.verdict === "manual" ? "pill" : "pill pill--error";
      return `<div class="scenario-result-row"><div><strong>${escapeHtml(r.scenarioName)}</strong><small>${escapeHtml(r.runId)}</small></div><span class="${cls}">${r.verdict.toUpperCase()}</span><small>${r.eventCount || 0} events / ${r.matchedFrictions?.length || 0} frictions matched</small></div>`;
    }).join("");
  };

  const renderRecentLogs = () => {
    if (!state.scenarioLog.length) return `<div class="scenario-empty">No logs yet.</div>`;
    return state.scenarioLog.slice(0, 12).map((log) => {
      const cls = log.level === "error" ? "scenario-log-item is-error" : log.level === "warn" ? "scenario-log-item is-warn" : log.level === "ok" ? "scenario-log-item is-ok" : "scenario-log-item";
      return `<div class="${cls}"><span>${new Date(log.timestamp).toLocaleTimeString()}</span><p>${escapeHtml(log.message)}</p></div>`;
    }).join("");
  };

  // ── Main render ────────────────────────────────────────────────────────────

  const render = () => {
    const step = state.wizardStep;
    const isSnippet = step !== "connect";
    const isAnalyzePhase = ["analyzing", "mapped", "activating", "active"].includes(step);
    const isActivatePhase = ["mapped", "activating", "active"].includes(step);
    const isDone = step === "active";
    const detected = state.installStatus === "verified_ready";
    const unverified = state.installStatus === "found_unverified";

    // Mapping snapshot numbers
    const baseBehaviorMapped = state.coverage?.behaviorMapped ?? state.metrics?.behaviorMapped ?? 0;
    const baseFrictionMapped = state.coverage?.frictionMapped ?? state.metrics?.frictionMapped ?? 0;
    const behaviorTarget = state.coverage?.behaviorTarget ?? state.metrics?.behaviorTarget ?? 614;
    const frictionTarget = state.coverage?.frictionTarget ?? state.metrics?.frictionTarget ?? 325;
    const behaviorMapped = Math.max(baseBehaviorMapped, state.mappingValidationOverlay.behaviorMapped || 0);
    const frictionMapped = Math.max(baseFrictionMapped, state.mappingValidationOverlay.frictionMapped || 0);
    const bDelta = Math.max(0, behaviorMapped - baseBehaviorMapped);
    const fDelta = Math.max(0, frictionMapped - baseFrictionMapped);
    const avgConf = state.run?.avgConfidence ?? 0;

    // Analysis progress
    const runStatus = state.run?.status ?? "";
    const progressPct = runStatus === "completed" ? 100 : runStatus === "running" ? 60 : runStatus === "queued" ? 15 : 0;

    // Scenario
    const selBehavior = BEHAVIOR_SUBCATEGORY_BY_ID.get(state.scenarioSelectedId);
    const selBehaviorPack = BEHAVIOR_CATEGORY_BY_ID.get(state.scenarioPackId);
    const selBehaviorPackScenarios = selBehaviorPack ? getScenariosForBehaviorCategory(selBehaviorPack.id) : [];
    const selFriction = FRICTION_SUBCATEGORY_BY_ID.get(state.frictionSelectedId);
    const selFrictionPack = FRICTION_CATEGORY_BY_ID.get(state.frictionPackId);
    const selFrictionPackScenarios = selFrictionPack ? getScenariosForFrictionCategory(selFrictionPack.id) : [];

    const bPlanned = state.scenarioCoverage.behaviorPlanned.length;
    const fPlanned = state.scenarioCoverage.frictionPlanned.length;
    const fDetected = state.scenarioCoverage.frictionDetected.length;
    const autoRuns = state.scenarioResults.filter((r) => r.verdict !== "manual");
    const passCount = autoRuns.filter((r) => r.verdict === "passed").length;

    root.innerHTML = `

      <!-- ── Step 1: Connect ──────────────────────────────────── -->
      <div class="wizard-card">
        <h3><span class="step-num ${isSnippet ? "done" : ""}">1</span> Connect Your Website</h3>
        <label for="siteUrlInput">Website URL</label>
        <div class="row">
          <input id="siteUrlInput" type="text" value="${escapeHtml(state.siteUrl)}"
            placeholder="https://your-store.com"
            ${isSnippet ? "disabled" : ""} />
          ${isSnippet
            ? `<button data-action="generate" disabled>Generated ✓</button>`
            : `<button data-action="generate" ${state.loading ? "disabled" : ""}>Generate Tag</button>`}
        </div>
        ${state.siteKey ? `<p class="micro">Site key: <code>${escapeHtml(state.siteKey)}</code></p>` : ""}
      </div>

      <!-- ── Step 2: Install Tag ──────────────────────────────── -->
      ${isSnippet ? `
      <div class="wizard-card">
        <h3><span class="step-num ${isAnalyzePhase ? "done" : ""}">2</span> Install Tag</h3>
        <div class="snippet-tabs">
          ${["script","shopify","gtm","webflow"].map((t) =>
            `<button data-action="snippet-tab-${t}" class="snippet-tab${state.snippetTab === t ? " active" : ""}">${t === "script" ? "HTML" : t.charAt(0).toUpperCase() + t.slice(1)}</button>`
          ).join("")}
        </div>
        <div class="code-block">
          <pre>${escapeHtml(state.snippet)}</pre>
          <button class="copy-btn" data-action="copy-snippet">${state.snippetCopied ? "Copied ✓" : "Copy"}</button>
        </div>
        <p class="snippet-note">
          ${state.snippetTab === "script" ? "Paste before &lt;/body&gt; in your HTML" :
            state.snippetTab === "shopify" ? "Paste in Theme Editor → theme.liquid → before &lt;/body&gt;" :
            state.snippetTab === "gtm" ? "New Custom HTML tag in GTM, trigger: All Pages" :
            "Project Settings → Custom Code → Before &lt;/body&gt; tag"}
        </p>

        <div class="install-status ${detected ? "is-detected" : unverified ? "is-unverified" : ""}">
          <div class="install-pulse ${detected ? "detected" : unverified ? "unverified" : ""}"></div>
          <span>${
            detected   ? "✓ Tag confirmed — widget is live" :
            unverified ? "⚡ Tag detected — confirming activity…" :
            state.installPolling ? "Checking for tag installation…" : "Waiting to check…"
          }</span>
          ${!detected ? `<button data-action="check-install" style="margin-left:auto;font-size:11px;padding:4px 8px;">Check Now</button>` : ""}
        </div>

        <button data-action="analyze"
          ${state.loading || (!detected && !unverified) || isAnalyzePhase ? "disabled" : ""}
          style="width:100%;margin-top:8px;">
          ${isAnalyzePhase ? "Analysis Running…" : (detected || unverified) ? "Analyze Website →" : "Waiting for tag…"}
        </button>
      </div>
      ` : ""}

      <!-- ── Step 3: Analyze & Map ────────────────────────────── -->
      ${isAnalyzePhase ? `
      <div class="wizard-card">
        <h3><span class="step-num ${isActivatePhase ? "done" : ""}">3</span> Analyze & Map</h3>
        ${step === "analyzing" ? `
          <p class="micro">${escapeHtml(state.run?.phase || "Starting…")}</p>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progressPct}%"></div></div>
          <p class="micro">${state.polling ? "Polling…" : ""}</p>
        ` : `
          <div class="metric-grid">
            <div class="metric">
              <span>Behaviors</span>
              <strong>${behaviorMapped}/${behaviorTarget}</strong>
              <small>${pct(behaviorMapped, behaviorTarget)} mapped${bDelta > 0 ? ` (+${bDelta} via scenarios)` : ""}</small>
            </div>
            <div class="metric">
              <span>Frictions</span>
              <strong>${frictionMapped}/${frictionTarget}</strong>
              <small>${pct(frictionMapped, frictionTarget)} mapped${fDelta > 0 ? ` (+${fDelta} via scenarios)` : ""}</small>
            </div>
            <div class="metric">
              <span>Confidence</span>
              <strong>${avgConf ? (avgConf * 100).toFixed(0) + "%" : "—"}</strong>
              <small>avg score</small>
            </div>
          </div>
          ${state.run?.status === "failed" ? `<p class="micro" style="color:#ffc0c0">Analysis failed: ${escapeHtml(state.run.errorMessage || "")}</p>` : ""}
        `}
      </div>
      ` : ""}

      <!-- ── Step 4: Activate ─────────────────────────────────── -->
      ${isActivatePhase ? `
      <div class="wizard-card">
        <h3><span class="step-num ${isDone ? "done" : ""}">4</span> Activate</h3>
        ${isDone ? `
          <div class="mode-badge ${state.activation?.mode === "active" ? "active" : "limited"}">
            <span>${state.activation?.mode === "active" ? "●" : "◐"}</span>
            ${state.activation?.mode === "active" ? "FULL ACTIVE" : "LIMITED ACTIVE"}
          </div>
          <p class="micro">AVA is live on your website. Tracking, evaluation, and intervention are running.</p>
          ${state.activation?.mode === "limited_active" ? `<p class="micro" style="color:var(--warn)">Coverage below threshold. PASSIVE + NUDGE interventions only until coverage improves. Use Scenario Control to validate and improve.</p>` : ""}
        ` : `
          <button data-action="activate"
            ${state.loading || step === "activating" || step !== "mapped" ? "disabled" : ""}
            style="width:100%;">
            ${step === "activating" ? "Activating…" : "Activate AVA →"}
          </button>
          <p class="micro">AVA will auto-select limited_active or active mode based on coverage.</p>
        `}
      </div>
      ` : ""}

      <!-- ── Scenario Control (post-activation) ───────────────── -->
      ${isDone ? `

      <div class="wizard-card scenario-card">
        <div class="row compact" style="margin-bottom:10px;">
          <h3 style="margin:0;"><span class="step-num done">5</span> Scenario Control</h3>
          <span class="badge">${state.scenarioStoreReady ? "Store Ready" : "Runner Offline"}</span>
        </div>

        <label for="scenarioSelect">Behavior Scenario</label>
        <select id="scenarioSelect" ${state.scenarioRunning ? "disabled" : ""}>${renderBehaviorOptions()}</select>

        <label for="scenarioPackSelect">Behavior Pack</label>
        <select id="scenarioPackSelect" ${state.scenarioRunning ? "disabled" : ""}>${renderBehaviorPackOptions()}</select>

        <label for="frictionScenarioSelect">Friction Scenario</label>
        <select id="frictionScenarioSelect" ${state.scenarioRunning ? "disabled" : ""}>${renderFrictionOptions()}</select>

        <label for="frictionPackSelect">Friction Pack</label>
        <select id="frictionPackSelect" ${state.scenarioRunning ? "disabled" : ""}>${renderFrictionPackOptions()}</select>

        <label for="scenarioSpeedSelect">Speed</label>
        <select id="scenarioSpeedSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${["fast","normal","slow"].map((v) => `<option value="${v}" ${v === state.scenarioSpeed ? "selected" : ""}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join("")}
        </select>

        <label for="scenarioRepeatInput">Repeat Count</label>
        <input id="scenarioRepeatInput" type="number" min="1" max="20" value="${Number(state.scenarioRepeat)||1}" ${state.scenarioRunning ? "disabled" : ""} />

        <div class="scenario-action-grid">
          <button data-action="scenario-run" ${state.scenarioRunning || !state.scenarioStoreReady || !state.scenarioSelectedId ? "disabled" : ""}>Run Behavior</button>
          <button data-action="scenario-run-pack" ${state.scenarioRunning || !state.scenarioStoreReady || !state.scenarioPackId ? "disabled" : ""}>Run Behavior Pack</button>
          <button data-action="scenario-run-friction" ${state.scenarioRunning || !state.scenarioStoreReady || !state.frictionSelectedId ? "disabled" : ""}>Run Friction</button>
          <button data-action="scenario-run-friction-pack" ${state.scenarioRunning || !state.scenarioStoreReady || !state.frictionPackId ? "disabled" : ""}>Run Friction Pack</button>
        </div>

        <div class="scenario-action-grid scenario-action-grid--secondary">
          <button data-action="scenario-reset" ${state.scenarioRunning ? "disabled" : ""}>Reset Store</button>
          <button data-action="scenario-stop" ${!state.scenarioRunning ? "disabled" : ""}>Stop</button>
          <button data-action="scenario-export" ${!state.scenarioResults.length ? "disabled" : ""}>Export JSON</button>
          <button data-action="scenario-ping">Ping Store</button>
        </div>

        <p class="micro">${escapeHtml(state.scenarioMessage)}</p>
        <p class="micro">Behavior: <strong>${escapeHtml(selBehavior ? `${selBehavior.id} — ${selBehavior.label}` : "n/a")}</strong></p>
        <p class="micro">Pack: <strong>${escapeHtml(selBehaviorPack?.label || "n/a")}</strong> (${selBehaviorPack?.items?.length || 0} subcategories, ${selBehaviorPackScenarios.length} scripts)</p>
        <p class="micro">Friction: <strong>${escapeHtml(selFriction ? `${selFriction.id} — ${selFriction.label}` : "n/a")}</strong></p>
        <p class="micro">Friction Pack: <strong>${escapeHtml(selFrictionPack?.label || "n/a")}</strong> (${selFrictionPack?.items?.length || 0} subcategories, ${selFrictionPackScenarios.length} scripts)</p>
      </div>

      <div class="wizard-card">
        <h3 style="margin-bottom:8px;">Coverage</h3>
        <div class="metric-grid metric-grid--2">
          <div class="metric"><span>Behaviors Planned</span><strong>${bPlanned}/${SCENARIO_TARGETS.behavior}</strong><small>${pct(bPlanned, SCENARIO_TARGETS.behavior)}</small></div>
          <div class="metric"><span>Frictions Planned</span><strong>${fPlanned}/${SCENARIO_TARGETS.friction}</strong><small>${pct(fPlanned, SCENARIO_TARGETS.friction)}</small></div>
          <div class="metric"><span>Frictions Detected</span><strong>${fDetected}/${SCENARIO_TARGETS.friction}</strong><small>${pct(fDetected, SCENARIO_TARGETS.friction)} observed</small></div>
          <div class="metric"><span>Pass Rate</span><strong>${passCount}/${autoRuns.length || 0}</strong><small>${pct(passCount, autoRuns.length || 1)}</small></div>
        </div>
      </div>

      <div class="wizard-card">
        <h3 style="margin-bottom:8px;">Scenario Results</h3>
        <div class="scenario-results-list">${renderRecentResults()}</div>
      </div>

      <div class="wizard-card">
        <h3 style="margin-bottom:8px;">Live Log</h3>
        <div class="scenario-log">${renderRecentLogs()}</div>
      </div>

      ` : ""}

      <!-- ── Status / error ───────────────────────────────────── -->
      ${state.error || state.message ? `
      <div class="status-card ${state.error ? "is-error" : "is-ok"}">
        ${escapeHtml(state.error || state.message)}
      </div>
      ` : ""}
    `;
  };

  render();

  return {
    destroy() {
      stopPolling();
      stopInstallPoll();
      stopScenarioHeartbeat();
      root.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
      window.removeEventListener("message", handleStoreMessage);
      pendingScenarioRuns.forEach((p) => clearTimeout(p.timeoutId));
      pendingScenarioRuns.clear();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities
// ─────────────────────────────────────────────────────────────────────────────

function toMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
