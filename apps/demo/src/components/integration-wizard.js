import {
  SCENARIO_REGISTRY,
} from "./scenario-registry.js";
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

const POLL_INTERVAL_MS = 3000;
const SCENARIO_TARGETS = { behavior: 614, friction: 325 };
const SCENARIO_STORE_URL = "http://localhost:3001";
const SPEED_MULTIPLIER = {
  fast: 0.65,
  normal: 1,
  slow: 1.6,
};

export function createIntegrationWizard(root, options) {
  const scenarioCoverageSets = {
    behaviorPlanned: new Set(),
    frictionPlanned: new Set(),
    frictionDetected: new Set(),
  };

  const pendingScenarioRuns = new Map();
  const runnableScenariosByBehaviorId = new Map();
  const runnableScenariosByFrictionId = new Map();
  for (const scenario of SCENARIO_REGISTRY) {
    for (const behaviorId of scenario.behaviorIds || []) {
      if (!runnableScenariosByBehaviorId.has(behaviorId)) {
        runnableScenariosByBehaviorId.set(behaviorId, []);
      }
      runnableScenariosByBehaviorId.get(behaviorId).push(scenario);
    }
    for (const frictionId of scenario.frictionIds || []) {
      if (!runnableScenariosByFrictionId.has(frictionId)) {
        runnableScenariosByFrictionId.set(frictionId, []);
      }
      runnableScenariosByFrictionId.get(frictionId).push(scenario);
    }
  }

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
    scenarioMessage: "Waiting for store scenario runner...",
    scenarioLog: [],
    scenarioResults: [],
    scenarioCoverage: {
      behaviorPlanned: [],
      frictionPlanned: [],
      frictionDetected: [],
    },
    mappingValidationOverlay: {
      behaviorMapped: 0,
      frictionMapped: 0,
      syncedAt: 0,
    },
  };

  let pollTimer = null;
  let scenarioHeartbeatTimer = null;

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

      // Reload the store iframe immediately — server has reset integrationStatus
      // to "analyzing", so the widget activation gate will now block the widget.
      const storeFrame = options.getStoreFrame?.();
      if (storeFrame) storeFrame.src = storeFrame.src;

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

  const getStoreFrame = () =>
    (typeof options.getStoreFrame === "function"
      ? options.getStoreFrame()
      : document.querySelector('.panel--center iframe[title="Demo Store"]')) ||
    null;

  const postToStore = (type, payload = {}) => {
    const frame = getStoreFrame();
    const target = frame?.contentWindow;
    if (!target) {
      throw new Error("Store frame is unavailable.");
    }
    target.postMessage(
      {
        source: "ava-demo-scenario",
        type,
        payload,
      },
      "*",
    );
  };

  const addScenarioLog = (message, level = "info") => {
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      message,
      level,
    };
    const next = [entry, ...state.scenarioLog].slice(0, 120);
    setState({ scenarioLog: next });
  };

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
    const baseBehaviorMapped =
      state.coverage?.behaviorMapped ?? state.metrics?.behaviorMapped ?? 0;
    const baseFrictionMapped =
      state.coverage?.frictionMapped ?? state.metrics?.frictionMapped ?? 0;
    const scenarioBehaviorMapped = scenarioCoverageSets.behaviorPlanned.size;
    const scenarioFrictionMapped = Math.max(
      scenarioCoverageSets.frictionPlanned.size,
      scenarioCoverageSets.frictionDetected.size,
    );

    setState({
      mappingValidationOverlay: {
        behaviorMapped: Math.max(baseBehaviorMapped, scenarioBehaviorMapped),
        frictionMapped: Math.max(baseFrictionMapped, scenarioFrictionMapped),
        syncedAt: Date.now(),
      },
    });
  };

  const sendScenarioPing = () => {
    try {
      postToStore("ava:scenario:ping", { ts: Date.now() });
    } catch {
      if (state.scenarioStoreReady) {
        setState({
          scenarioStoreReady: false,
          scenarioStoreMeta: null,
          scenarioMessage: "Runner Offline",
        });
      }
    }
  };

  const startScenarioHeartbeat = () => {
    if (scenarioHeartbeatTimer) {
      clearInterval(scenarioHeartbeatTimer);
    }
    scenarioHeartbeatTimer = setInterval(sendScenarioPing, 4000);
    sendScenarioPing();
  };

  const stopScenarioHeartbeat = () => {
    if (scenarioHeartbeatTimer) {
      clearInterval(scenarioHeartbeatTimer);
      scenarioHeartbeatTimer = null;
    }
  };

  const settlePendingRun = (runId, data, error) => {
    const pending = pendingScenarioRuns.get(runId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingScenarioRuns.delete(runId);
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve(data);
    }
  };

  const handleStoreMessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.source !== "ava-store-scenario") return;

    const payload = msg.payload || {};

    if (msg.type === "ava:scenario:ready") {
      const nextVersion = payload.version || "v1";
      const currentVersion = state.scenarioStoreMeta?.version || "v1";
      const metaChanged = currentVersion !== nextVersion;
      const becameReady = !state.scenarioStoreReady;
      if (!becameReady && !metaChanged) return;

      setState({
        scenarioStoreReady: true,
        scenarioStoreMeta: payload,
        scenarioMessage: `Store runner ready (${nextVersion})`,
      });
      return;
    }

    if (msg.type === "ava:scenario:step") {
      const stepInfo = payload?.step || {};
      addScenarioLog(
        `${payload.runId || "run"} :: step ${stepInfo.index ?? "?"} ${stepInfo.action || ""}`,
        stepInfo.status === "failed" ? "error" : "info",
      );
      return;
    }

    if (msg.type === "ava:scenario:reset:complete") {
      addScenarioLog("Store reset complete", "ok");
      return;
    }

    if (msg.type === "ava:scenario:run:complete") {
      settlePendingRun(payload.runId, payload, null);
      return;
    }

    if (msg.type === "ava:scenario:run:error") {
      settlePendingRun(
        payload.runId,
        null,
        new Error(payload.error || "Scenario run failed in store."),
      );
    }
  };

  window.addEventListener("message", handleStoreMessage);

  const waitForRunCompletion = (runId, timeoutMs) =>
    new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingScenarioRuns.delete(runId);
        reject(new Error(`Scenario run timeout (${runId})`));
      }, timeoutMs);
      pendingScenarioRuns.set(runId, { resolve, reject, timeoutId });
    });

  const captureBaseline = async () => {
    try {
      const sessionsRes = await api(
        `/api/sessions?siteUrl=${encodeURIComponent(SCENARIO_STORE_URL)}`,
      );
      const sessions = Array.isArray(sessionsRes.sessions) ? sessionsRes.sessions : [];
      const session = sessions[0] || null;
      if (!session?.id) return null;

      const eventsRes = await api(
        `/api/sessions/${session.id}/events?limit=500`,
      );

      return {
        sessionId: session.id,
        beforeEventCount: Array.isArray(eventsRes.events) ? eventsRes.events.length : 0,
      };
    } catch {
      return null;
    }
  };

  const collectEvidence = async ({ scenario, runStartedAt, baseline }) => {
    try {
      const sessionsRes = await api(
        `/api/sessions?siteUrl=${encodeURIComponent(SCENARIO_STORE_URL)}`,
      );
      const sessions = Array.isArray(sessionsRes.sessions) ? sessionsRes.sessions : [];
      const session = sessions[0] || null;
      if (!session?.id) {
        return {
          sessionId: null,
          eventCount: 0,
          eventTypes: [],
          detectedFrictionIds: [],
          matchedExpectedFrictions: [],
          interventionCount: 0,
          newEventsVsBaseline: 0,
        };
      }

      const sinceIso = runStartedAt.toISOString();
      const [eventsRes, analyticsRes] = await Promise.all([
        api(
          `/api/sessions/${session.id}/events?since=${encodeURIComponent(sinceIso)}&limit=500`,
        ),
        api(`/api/analytics/session/${session.id}`),
      ]);

      const events = Array.isArray(eventsRes.events) ? eventsRes.events : [];
      const eventTypes = [...new Set(events.map((e) => e.eventType).filter(Boolean))];
      const frictionFromEvents = events
        .map((e) => e.frictionId)
        .filter((f) => typeof f === "string" && f.length > 0);
      const frictionFromAnalytics = Object.keys(
        analyticsRes?.frictionBreakdown || {},
      ).filter(Boolean);
      const detectedFrictionIds = [
        ...new Set([...frictionFromEvents, ...frictionFromAnalytics]),
      ].sort();
      const matchedExpectedFrictions = (scenario.frictionIds || []).filter((fid) =>
        detectedFrictionIds.includes(fid),
      );

      const beforeEventCount = baseline?.sessionId === session.id
        ? baseline.beforeEventCount || 0
        : 0;

      const allEventsRes = await api(`/api/sessions/${session.id}/events?limit=500`);
      const allEvents = Array.isArray(allEventsRes.events) ? allEventsRes.events : [];
      const newEventsVsBaseline = Math.max(0, allEvents.length - beforeEventCount);

      return {
        sessionId: session.id,
        eventCount: events.length,
        eventTypes,
        detectedFrictionIds,
        matchedExpectedFrictions,
        interventionCount: Number(analyticsRes?.outcomeBreakdown?.total || 0),
        newEventsVsBaseline,
      };
    } catch {
      return {
        sessionId: null,
        eventCount: 0,
        eventTypes: [],
        detectedFrictionIds: [],
        matchedExpectedFrictions: [],
        interventionCount: 0,
        newEventsVsBaseline: 0,
      };
    }
  };

  const buildVerdict = (scenario, storeRun, evidence) => {
    const expectedEvents = scenario.assertions?.expectedEventTypes || [];
    const expectedMinEvents = Number(scenario.assertions?.minEventCount || 1);
    const hasExpectedEvents =
      expectedEvents.length === 0 ||
      expectedEvents.some((evt) => evidence.eventTypes.includes(evt));

    const hasExpectedFriction =
      scenario.frictionIds.length === 0 ||
      evidence.matchedExpectedFrictions.length > 0;

    const minEventsReached = evidence.eventCount >= expectedMinEvents;
    const storeSucceeded = Boolean(storeRun?.success);

    let status = "failed";
    if (storeSucceeded && minEventsReached && hasExpectedEvents && hasExpectedFriction) {
      status = "passed";
    } else if (storeSucceeded && (minEventsReached || hasExpectedEvents)) {
      status = "partial";
    }

    return {
      status,
      checks: {
        storeSucceeded,
        minEventsReached,
        hasExpectedEvents,
        hasExpectedFriction,
      },
    };
  };

  const registerCoverage = (scenario, evidence, overrides = null) => {
    const behaviorIds = overrides?.behaviorIds ?? scenario.behaviorIds ?? [];
    const frictionIds = overrides?.frictionIds ?? scenario.frictionIds ?? [];

    for (const bid of behaviorIds) {
      scenarioCoverageSets.behaviorPlanned.add(bid);
    }
    for (const fid of frictionIds) {
      scenarioCoverageSets.frictionPlanned.add(fid);
    }
    for (const detected of evidence.detectedFrictionIds || []) {
      scenarioCoverageSets.frictionDetected.add(detected);
    }
    updateScenarioCoverageState();
    syncScenarioCoverageToMappingSnapshot();
  };

  const getPrimaryScenarioForBehavior = (behaviorId) =>
    runnableScenariosByBehaviorId.get(behaviorId)?.[0] || null;

  const getScenariosForBehaviorCategory = (categoryId) => {
    const category = BEHAVIOR_CATEGORY_BY_ID.get(categoryId);
    if (!category) return [];
    const unique = new Map();
    for (const item of category.items) {
      const scenarios = runnableScenariosByBehaviorId.get(item.id) || [];
      for (const scenario of scenarios) {
        if (!unique.has(scenario.id)) {
          unique.set(scenario.id, scenario);
        }
      }
    }
    return [...unique.values()];
  };

  const getPrimaryScenarioForFriction = (frictionId) =>
    runnableScenariosByFrictionId.get(frictionId)?.[0] || null;

  const getScenariosForFrictionCategory = (categoryId) => {
    const category = FRICTION_CATEGORY_BY_ID.get(categoryId);
    if (!category) return [];
    const unique = new Map();
    for (const item of category.items) {
      const scenarios = runnableScenariosByFrictionId.get(item.id) || [];
      for (const scenario of scenarios) {
        if (!unique.has(scenario.id)) {
          unique.set(scenario.id, scenario);
        }
      }
    }
    return [...unique.values()];
  };

  const getFirstBehaviorIdForPack = (packId) => {
    const category = BEHAVIOR_CATEGORY_BY_ID.get(packId);
    return category?.items?.[0]?.id || "";
  };

  const getFirstFrictionIdForPack = (packId) => {
    const category = FRICTION_CATEGORY_BY_ID.get(packId);
    return category?.items?.[0]?.id || "";
  };

  const runManualBehaviorSelection = async (behavior, context = {}) => {
    const startedAt = new Date();
    const runId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    registerCoverage(
      { behaviorIds: [behavior.id], frictionIds: [] },
      { detectedFrictionIds: [] },
    );

    const record = {
      runId,
      scenarioId: behavior.id,
      scenarioName: `${behavior.id} — ${behavior.label}`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      verdict: "manual",
      expectedFrictions: [],
      detectedFrictions: [],
      matchedFrictions: [],
      eventCount: 0,
      interventionCount: 0,
      checks: {
        storeSucceeded: false,
        minEventsReached: false,
        hasExpectedEvents: false,
        hasExpectedFriction: false,
      },
      context,
    };

    setState({
      scenarioResults: [record, ...state.scenarioResults].slice(0, 40),
      scenarioMessage: `Recorded ${behavior.id} for validation planning.`,
    });

    addScenarioLog(
      `${behavior.id} selected (${behavior.categoryLabel}) — no automation script exists yet; recorded for validation coverage.`,
      "warn",
    );

    await refreshStatus();
    return record;
  };

  const runManualFrictionSelection = async (friction, context = {}) => {
    const startedAt = new Date();
    const runId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    registerCoverage(
      { behaviorIds: [], frictionIds: [friction.id] },
      { detectedFrictionIds: [] },
    );

    const record = {
      runId,
      scenarioId: friction.id,
      scenarioName: `${friction.id} — ${friction.label}`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      verdict: "manual",
      expectedFrictions: [friction.id],
      detectedFrictions: [],
      matchedFrictions: [],
      eventCount: 0,
      interventionCount: 0,
      checks: {
        storeSucceeded: false,
        minEventsReached: false,
        hasExpectedEvents: false,
        hasExpectedFriction: false,
      },
      context,
    };

    setState({
      scenarioResults: [record, ...state.scenarioResults].slice(0, 40),
      scenarioMessage: `Recorded ${friction.id} for validation planning.`,
    });

    addScenarioLog(
      `${friction.id} selected (${friction.categoryLabel}) — no automation script exists yet; recorded for validation coverage.`,
      "warn",
    );

    await refreshStatus();
    return record;
  };

  const resetStoreScenarioState = async () => {
    try {
      postToStore("ava:scenario:reset", { source: "wizard" });
      await delay(350);
      setState({ scenarioMessage: "Store reset sent." });
    } catch (error) {
      setState({ scenarioMessage: `Store reset failed: ${toMessage(error)}` });
    }
  };

  const runScenario = async (scenario, context = {}) => {
    const runId = `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    const baseline = await captureBaseline();

    setState({
      scenarioLastRunId: runId,
      scenarioMessage: `Running ${scenario.name}...`,
    });
    addScenarioLog(`Run ${runId} started: ${scenario.name}`, "info");

    try {
      await resetStoreScenarioState();

      const speed = SPEED_MULTIPLIER[state.scenarioSpeed] || 1;
      postToStore("ava:scenario:run", {
        runId,
        scenarioId: scenario.id,
        steps: scenario.steps,
        injectors: scenario.injectors || {},
        delayMultiplier: speed,
        meta: context,
      });

      const timeoutMs = Math.max(30000, (scenario.steps.length * 4000 + 15000) * speed);
      const storeRun = await waitForRunCompletion(runId, timeoutMs);
      const evidence = await collectEvidence({ scenario, runStartedAt: startedAt, baseline });
      const verdict = buildVerdict(scenario, storeRun, evidence);
      registerCoverage(scenario, evidence, context.coverageOverride || null);

      const record = {
        runId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        verdict: verdict.status,
        expectedFrictions: scenario.frictionIds,
        detectedFrictions: evidence.detectedFrictionIds,
        matchedFrictions: evidence.matchedExpectedFrictions,
        eventCount: evidence.eventCount,
        interventionCount: evidence.interventionCount,
        checks: verdict.checks,
        storeRun,
        evidence,
      };

      const results = [record, ...state.scenarioResults].slice(0, 40);
      setState({
        scenarioResults: results,
        scenarioMessage: `${scenario.name}: ${verdict.status.toUpperCase()}`,
      });

      addScenarioLog(
        `${scenario.name} -> ${verdict.status.toUpperCase()} (${evidence.eventCount} events, ${evidence.matchedExpectedFrictions.length}/${scenario.frictionIds.length} expected frictions)` ,
        verdict.status === "passed" ? "ok" : verdict.status === "partial" ? "warn" : "error",
      );

      await refreshStatus();

      return record;
    } catch (error) {
      addScenarioLog(`${scenario.name} failed: ${toMessage(error)}`, "error");
      const failed = {
        runId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        verdict: "failed",
        expectedFrictions: scenario.frictionIds,
        detectedFrictions: [],
        matchedFrictions: [],
        eventCount: 0,
        interventionCount: 0,
        checks: {
          storeSucceeded: false,
          minEventsReached: false,
          hasExpectedEvents: false,
          hasExpectedFriction: false,
        },
        error: toMessage(error),
      };

      setState({
        scenarioResults: [failed, ...state.scenarioResults].slice(0, 40),
        scenarioMessage: `${scenario.name}: FAILED`,
      });

      await refreshStatus();

      return failed;
    }
  };

  const onRunSingleScenario = async () => {
    if (state.scenarioRunning) return;

    const behavior = BEHAVIOR_SUBCATEGORY_BY_ID.get(state.scenarioSelectedId);
    if (!behavior) {
      setState({ scenarioMessage: "Select a valid subcategory first." });
      return;
    }

    const scenario = getPrimaryScenarioForBehavior(behavior.id);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    const runName = scenario ? `auto for ${behavior.id}` : `manual ${behavior.id}`;

    setState({
      scenarioRunning: true,
      scenarioStopRequested: false,
      scenarioMessage: `Queued ${runName} x${repeat}`,
      scenarioPackId: behavior.categoryId,
      frictionSelectedId: "",
      frictionPackId: "",
    });

    for (let i = 0; i < repeat; i++) {
      if (state.scenarioStopRequested) break;
      if (scenario) {
        await runScenario(scenario, {
          mode: "single",
          selectedBehaviorId: behavior.id,
          selectedBehaviorLabel: behavior.label,
          repeatIndex: i + 1,
          repeatTotal: repeat,
          coverageOverride: {
            behaviorIds: [behavior.id],
            frictionIds: [],
          },
        });
      } else {
        await runManualBehaviorSelection(behavior, {
          mode: "single",
          repeatIndex: i + 1,
          repeatTotal: repeat,
        });
      }
    }

    setState({
      scenarioRunning: false,
      scenarioStopRequested: false,
    });
  };

  const onRunScenarioPack = async () => {
    if (state.scenarioRunning) return;

    const selectedCategory = BEHAVIOR_CATEGORY_BY_ID.get(state.scenarioPackId);
    if (!selectedCategory) {
      setState({ scenarioMessage: "Select a valid category pack first." });
      return;
    }
    const categoryBehaviorIds = selectedCategory.items.map((item) => item.id);
    const scenarios = getScenariosForBehaviorCategory(state.scenarioPackId);

    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);

    setState({
      scenarioRunning: true,
      scenarioStopRequested: false,
      scenarioMessage: `Running pack ${selectedCategory.label}`,
      scenarioSelectedId: getFirstBehaviorIdForPack(selectedCategory.id),
      frictionSelectedId: "",
      frictionPackId: "",
    });

    // Category selection itself contributes to planned validation scope.
    registerCoverage(
      { behaviorIds: categoryBehaviorIds, frictionIds: [] },
      { detectedFrictionIds: [] },
    );

    if (scenarios.length === 0) {
      addScenarioLog(
        `${selectedCategory.label}: no automated scripts yet; pack recorded for coverage planning.`,
        "warn",
      );
    } else {
      outer: for (const scenario of scenarios) {
        const scenarioBehaviorInPack = (scenario.behaviorIds || []).filter((bid) =>
          categoryBehaviorIds.includes(bid),
        );
        for (let i = 0; i < repeat; i++) {
          if (state.scenarioStopRequested) {
            break outer;
          }
          await runScenario(scenario, {
            mode: "pack",
            packId: state.scenarioPackId,
            repeatIndex: i + 1,
            repeatTotal: repeat,
            coverageOverride: {
              behaviorIds: scenarioBehaviorInPack,
              frictionIds: scenario.frictionIds || [],
            },
          });
        }
      }
    }

    setState({
      scenarioRunning: false,
      scenarioStopRequested: false,
      scenarioMessage: `${selectedCategory.label} pack run finished.`,
    });
  };

  const onRunSingleFrictionScenario = async () => {
    if (state.scenarioRunning) return;

    const friction = FRICTION_SUBCATEGORY_BY_ID.get(state.frictionSelectedId);
    if (!friction) {
      setState({ scenarioMessage: "Select a valid friction subcategory first." });
      return;
    }

    const scenario = getPrimaryScenarioForFriction(friction.id);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);
    const runName = scenario ? `auto for ${friction.id}` : `manual ${friction.id}`;

    setState({
      scenarioRunning: true,
      scenarioStopRequested: false,
      scenarioMessage: `Queued ${runName} x${repeat}`,
      frictionPackId: friction.categoryId,
      scenarioSelectedId: "",
      scenarioPackId: "",
    });

    for (let i = 0; i < repeat; i++) {
      if (state.scenarioStopRequested) break;
      if (scenario) {
        await runScenario(scenario, {
          mode: "single-friction",
          selectedFrictionId: friction.id,
          selectedFrictionLabel: friction.label,
          repeatIndex: i + 1,
          repeatTotal: repeat,
          coverageOverride: {
            behaviorIds: [],
            frictionIds: [friction.id],
          },
        });
      } else {
        await runManualFrictionSelection(friction, {
          mode: "single-friction",
          repeatIndex: i + 1,
          repeatTotal: repeat,
        });
      }
    }

    setState({
      scenarioRunning: false,
      scenarioStopRequested: false,
    });
  };

  const onRunFrictionPack = async () => {
    if (state.scenarioRunning) return;

    const selectedCategory = FRICTION_CATEGORY_BY_ID.get(state.frictionPackId);
    if (!selectedCategory) {
      setState({ scenarioMessage: "Select a valid friction pack first." });
      return;
    }
    const categoryFrictionIds = selectedCategory.items.map((item) => item.id);
    const scenarios = getScenariosForFrictionCategory(state.frictionPackId);
    const repeat = Math.max(1, Number(state.scenarioRepeat) || 1);

    setState({
      scenarioRunning: true,
      scenarioStopRequested: false,
      scenarioMessage: `Running friction pack ${selectedCategory.label}`,
      frictionSelectedId: getFirstFrictionIdForPack(selectedCategory.id),
      scenarioSelectedId: "",
      scenarioPackId: "",
    });

    // Friction pack selection contributes to planned friction scope.
    registerCoverage(
      { behaviorIds: [], frictionIds: categoryFrictionIds },
      { detectedFrictionIds: [] },
    );

    if (scenarios.length === 0) {
      addScenarioLog(
        `${selectedCategory.label}: no automated scripts yet; pack recorded for coverage planning.`,
        "warn",
      );
    } else {
      outer: for (const scenario of scenarios) {
        const scenarioFrictionInPack = (scenario.frictionIds || []).filter((fid) =>
          categoryFrictionIds.includes(fid),
        );
        for (let i = 0; i < repeat; i++) {
          if (state.scenarioStopRequested) {
            break outer;
          }
          await runScenario(scenario, {
            mode: "pack-friction",
            packId: state.frictionPackId,
            repeatIndex: i + 1,
            repeatTotal: repeat,
            coverageOverride: {
              behaviorIds: [],
              frictionIds: scenarioFrictionInPack,
            },
          });
        }
      }
    }

    setState({
      scenarioRunning: false,
      scenarioStopRequested: false,
      scenarioMessage: `${selectedCategory.label} friction pack run finished.`,
    });
  };

  const onStopScenario = () => {
    if (!state.scenarioRunning) return;
    setState({
      scenarioStopRequested: true,
      scenarioMessage: "Stop requested. Waiting for current step to finish...",
    });
    try {
      postToStore("ava:scenario:stop", { runId: state.scenarioLastRunId || null });
    } catch {
      // no-op
    }
  };

  const onExportScenarioResults = async () => {
    if (!state.scenarioResults.length) {
      setState({ scenarioMessage: "No scenario results to export yet." });
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      siteUrl: state.siteUrl,
      scenarioStoreUrl: SCENARIO_STORE_URL,
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

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `scenario-evidence-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    setState({ scenarioMessage: "Scenario evidence exported." });
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

    if (
      target.id === "scenarioSelect" &&
      target instanceof HTMLSelectElement
    ) {
      const nextBehaviorId = target.value || "";
      const selectedBehavior = BEHAVIOR_SUBCATEGORY_BY_ID.get(nextBehaviorId);
      setState({
        scenarioSelectedId: nextBehaviorId,
        scenarioPackId: selectedBehavior?.categoryId || "",
        frictionSelectedId: "",
        frictionPackId: "",
      });
    }
    if (
      target.id === "scenarioPackSelect" &&
      target instanceof HTMLSelectElement
    ) {
      const nextPackId = target.value || "";
      setState({
        scenarioPackId: nextPackId,
        scenarioSelectedId: getFirstBehaviorIdForPack(nextPackId),
        frictionSelectedId: "",
        frictionPackId: "",
      });
    }
    if (
      target.id === "frictionScenarioSelect" &&
      target instanceof HTMLSelectElement
    ) {
      const nextFrictionId = target.value || "";
      const selectedFriction = FRICTION_SUBCATEGORY_BY_ID.get(nextFrictionId);
      setState({
        frictionSelectedId: nextFrictionId,
        frictionPackId: selectedFriction?.categoryId || "",
        scenarioSelectedId: "",
        scenarioPackId: "",
      });
    }
    if (
      target.id === "frictionPackSelect" &&
      target instanceof HTMLSelectElement
    ) {
      const nextPackId = target.value || "";
      setState({
        frictionPackId: nextPackId,
        frictionSelectedId: getFirstFrictionIdForPack(nextPackId),
        scenarioSelectedId: "",
        scenarioPackId: "",
      });
    }
    if (
      target.id === "scenarioSpeedSelect" &&
      target instanceof HTMLSelectElement
    ) {
      setState({ scenarioSpeed: target.value });
    }
    if (
      target.id === "scenarioRepeatInput" &&
      target instanceof HTMLInputElement
    ) {
      const nextRepeat = Math.max(1, Math.min(20, Number(target.value) || 1));
      setState({ scenarioRepeat: nextRepeat });
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
      return;
    }
    if (action === "scenario-run") {
      void onRunSingleScenario();
      return;
    }
    if (action === "scenario-run-pack") {
      void onRunScenarioPack();
      return;
    }
    if (action === "scenario-run-friction") {
      void onRunSingleFrictionScenario();
      return;
    }
    if (action === "scenario-run-friction-pack") {
      void onRunFrictionPack();
      return;
    }
    if (action === "scenario-reset") {
      void resetStoreScenarioState();
      return;
    }
    if (action === "scenario-stop") {
      onStopScenario();
      return;
    }
    if (action === "scenario-export") {
      void onExportScenarioResults();
      return;
    }
    if (action === "scenario-ping") {
      sendScenarioPing();
    }
  };

  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);

  const getStepState = () => {
    const status = state.run?.status ?? "";
    const verificationDone = Boolean(state.verification);
    const activationDone = Boolean(state.activation);

    const done = new Set();
    if (status && status !== "queued") done.add("analyze");
    if (status === "completed") done.add("map");
    if (verificationDone) done.add("verify");
    if (activationDone) done.add("activate");

    return done;
  };

  const coveragePct = (value, total) => {
    if (!value || !total) return "0%";
    return `${Math.round((value / total) * 100)}%`;
  };

  const renderScenarioSelectOptions = () =>
    [
      `<option value="" ${!state.scenarioSelectedId ? "selected" : ""}>None</option>`,
      ...BEHAVIOR_CATEGORY_CATALOG.map(
        (category) => `
          <optgroup label="${escapeHtml(category.label)}">
            ${category.items
              .map(
                (item) =>
                  `<option value="${item.id}" ${
                    item.id === state.scenarioSelectedId ? "selected" : ""
                  }>${escapeHtml(`${item.id} — ${item.label}`)}</option>`,
              )
              .join("")}
          </optgroup>
        `,
      ),
    ].join("");

  const renderScenarioPackOptions = () =>
    [
      `<option value="" ${!state.scenarioPackId ? "selected" : ""}>None</option>`,
      ...BEHAVIOR_CATEGORY_PACKS.map(
        (pack) =>
          `<option value="${pack.id}" ${
            pack.id === state.scenarioPackId ? "selected" : ""
          }>${escapeHtml(`${pack.label} (${pack.behaviorIds.length})`)}</option>`,
      ),
    ].join("");

  const renderFrictionScenarioOptions = () =>
    [
      `<option value="" ${!state.frictionSelectedId ? "selected" : ""}>None</option>`,
      ...FRICTION_CATEGORY_CATALOG.map(
        (category) => `
          <optgroup label="${escapeHtml(category.label)}">
            ${category.items
              .map(
                (item) =>
                  `<option value="${item.id}" ${
                    item.id === state.frictionSelectedId ? "selected" : ""
                  }>${escapeHtml(`${item.id} — ${item.label}`)}</option>`,
              )
              .join("")}
          </optgroup>
        `,
      ),
    ].join("");

  const renderFrictionPackOptions = () =>
    [
      `<option value="" ${!state.frictionPackId ? "selected" : ""}>None</option>`,
      ...FRICTION_CATEGORY_PACKS.map(
        (pack) =>
          `<option value="${pack.id}" ${
            pack.id === state.frictionPackId ? "selected" : ""
          }>${escapeHtml(`${pack.label} (${pack.frictionIds.length})`)}</option>`,
      ),
    ].join("");

  const renderScenarioSpeedOptions = () => {
    const options = [
      { value: "fast", label: "Fast" },
      { value: "normal", label: "Normal" },
      { value: "slow", label: "Slow" },
    ];
    return options
      .map(
        (opt) =>
          `<option value="${opt.value}" ${
            opt.value === state.scenarioSpeed ? "selected" : ""
          }>${opt.label}</option>`,
      )
      .join("");
  };

  const renderRecentResults = () => {
    if (!state.scenarioResults.length) {
      return `<div class="scenario-empty">No scenario runs yet.</div>`;
    }

    return state.scenarioResults
      .slice(0, 8)
      .map((result) => {
        const badgeClass =
          result.verdict === "passed"
            ? "pill pill--ok"
            : result.verdict === "partial"
              ? "pill pill--warn"
              : result.verdict === "manual"
                ? "pill"
                : "pill pill--error";
        return `
          <div class="scenario-result-row">
            <div>
              <strong>${escapeHtml(result.scenarioName)}</strong>
              <small>${escapeHtml(result.runId)}</small>
            </div>
            <span class="${badgeClass}">${result.verdict.toUpperCase()}</span>
            <small>${result.eventCount || 0} events / ${result.matchedFrictions?.length || 0} matched frictions</small>
          </div>
        `;
      })
      .join("");
  };

  const renderRecentLogs = () => {
    if (!state.scenarioLog.length) {
      return `<div class="scenario-empty">No live logs yet.</div>`;
    }

    return state.scenarioLog
      .slice(0, 12)
      .map((log) => {
        const cls =
          log.level === "error"
            ? "scenario-log-item is-error"
            : log.level === "warn"
              ? "scenario-log-item is-warn"
              : log.level === "ok"
                ? "scenario-log-item is-ok"
                : "scenario-log-item";
        return `<div class="${cls}"><span>${new Date(log.timestamp).toLocaleTimeString()}</span><p>${escapeHtml(log.message)}</p></div>`;
      })
      .join("");
  };

  const render = () => {
    const done = getStepState();
    const baseBehaviorMapped =
      state.coverage?.behaviorMapped ?? state.metrics?.behaviorMapped ?? 0;
    const behaviorTarget =
      state.coverage?.behaviorTarget ?? state.metrics?.behaviorTarget ?? 614;
    const baseFrictionMapped =
      state.coverage?.frictionMapped ?? state.metrics?.frictionMapped ?? 0;
    const frictionTarget =
      state.coverage?.frictionTarget ?? state.metrics?.frictionTarget ?? 325;
    const behaviorMapped = Math.max(
      baseBehaviorMapped,
      state.mappingValidationOverlay.behaviorMapped || 0,
    );
    const frictionMapped = Math.max(
      baseFrictionMapped,
      state.mappingValidationOverlay.frictionMapped || 0,
    );
    const behaviorValidatedDelta = Math.max(0, behaviorMapped - baseBehaviorMapped);
    const frictionValidatedDelta = Math.max(0, frictionMapped - baseFrictionMapped);
    const avgConf = state.run?.avgConfidence ?? 0;

    const mappingDone = state.run?.status === "completed";
    const verifyDone = Boolean(state.verification);

    const selectedBehaviorSubcategory = BEHAVIOR_SUBCATEGORY_BY_ID.get(state.scenarioSelectedId);
    const selectedBehaviorPack = BEHAVIOR_CATEGORY_BY_ID.get(state.scenarioPackId);
    const selectedBehaviorPackRunnableScenarios = selectedBehaviorPack
      ? getScenariosForBehaviorCategory(selectedBehaviorPack.id)
      : [];
    const selectedFrictionSubcategory = FRICTION_SUBCATEGORY_BY_ID.get(state.frictionSelectedId);
    const selectedFrictionPack = FRICTION_CATEGORY_BY_ID.get(state.frictionPackId);
    const selectedFrictionPackRunnableScenarios = selectedFrictionPack
      ? getScenariosForFrictionCategory(selectedFrictionPack.id)
      : [];

    const behaviorPlannedCount = state.scenarioCoverage.behaviorPlanned.length;
    const frictionPlannedCount = state.scenarioCoverage.frictionPlanned.length;
    const frictionDetectedCount = state.scenarioCoverage.frictionDetected.length;

    const automatedScenarioRuns = state.scenarioResults.filter(
      (r) => r.verdict !== "manual",
    );
    const scenarioPassCount = automatedScenarioRuns.filter(
      (r) => r.verdict === "passed",
    ).length;
    const scenarioRunTotal = automatedScenarioRuns.length;

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
            ${
              behaviorValidatedDelta > 0
                ? `<small>+${behaviorValidatedDelta} validated via scenarios</small>`
                : ""
            }
          </div>
          <div class="metric">
            <span>Frictions</span>
            <strong>${frictionMapped}/${frictionTarget}</strong>
            <small>${coveragePct(frictionMapped, frictionTarget)} mapped</small>
            ${
              frictionValidatedDelta > 0
                ? `<small>+${frictionValidatedDelta} validated via scenarios</small>`
                : ""
            }
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

      <section class="wizard-card scenario-card">
        <div class="row compact">
          <h3>Scenario Control</h3>
          <span class="badge">${state.scenarioStoreReady ? "Store Ready" : "Runner Offline"}</span>
        </div>

        <label for="scenarioSelect">Behavior Scenario (Subcategory)</label>
        <select id="scenarioSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${renderScenarioSelectOptions()}
        </select>

        <label for="scenarioPackSelect">Behavior Pack</label>
        <select id="scenarioPackSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${renderScenarioPackOptions()}
        </select>

        <label for="frictionScenarioSelect">Friction Scenario (Subcategory)</label>
        <select id="frictionScenarioSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${renderFrictionScenarioOptions()}
        </select>

        <label for="frictionPackSelect">Friction Pack</label>
        <select id="frictionPackSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${renderFrictionPackOptions()}
        </select>

        <label for="scenarioSpeedSelect">Execution Speed</label>
        <select id="scenarioSpeedSelect" ${state.scenarioRunning ? "disabled" : ""}>
          ${renderScenarioSpeedOptions()}
        </select>

        <label for="scenarioRepeatInput">Repeat Count</label>
        <input id="scenarioRepeatInput" type="number" min="1" max="20" value="${Number(state.scenarioRepeat) || 1}" ${state.scenarioRunning ? "disabled" : ""} />

        <div class="scenario-action-grid">
          <button data-action="scenario-run" ${state.scenarioRunning || !state.scenarioStoreReady || !state.scenarioSelectedId ? "disabled" : ""}>Run Behavior</button>
          <button data-action="scenario-run-pack" ${state.scenarioRunning || !state.scenarioStoreReady || !state.scenarioPackId ? "disabled" : ""}>Run Behavior Pack</button>
          <button data-action="scenario-run-friction" ${state.scenarioRunning || !state.scenarioStoreReady || !state.frictionSelectedId ? "disabled" : ""}>Run Friction</button>
          <button data-action="scenario-run-friction-pack" ${state.scenarioRunning || !state.scenarioStoreReady || !state.frictionPackId ? "disabled" : ""}>Run Friction Pack</button>
        </div>

        <div class="scenario-action-grid scenario-action-grid--secondary">
          <button data-action="scenario-reset" ${state.scenarioRunning ? "disabled" : ""}>Reset Store</button>
          <button data-action="scenario-stop" ${!state.scenarioRunning ? "disabled" : ""}>Stop Run</button>
          <button data-action="scenario-export" ${state.scenarioResults.length === 0 ? "disabled" : ""}>Export Evidence</button>
          <button data-action="scenario-ping">Ping Store</button>
        </div>

        <p class="micro">${escapeHtml(state.scenarioMessage)}</p>
        <p class="micro">Behavior selected: <strong>${escapeHtml(selectedBehaviorSubcategory ? `${selectedBehaviorSubcategory.id} — ${selectedBehaviorSubcategory.label}` : "n/a")}</strong></p>
        <p class="micro">Behavior pack: <strong>${escapeHtml(selectedBehaviorPack?.label || "n/a")}</strong> (${selectedBehaviorPack?.items?.length || 0} subcategories, ${selectedBehaviorPackRunnableScenarios.length} automated scripts)</p>
        <p class="micro">Friction selected: <strong>${escapeHtml(selectedFrictionSubcategory ? `${selectedFrictionSubcategory.id} — ${selectedFrictionSubcategory.label}` : "n/a")}</strong></p>
        <p class="micro">Friction pack: <strong>${escapeHtml(selectedFrictionPack?.label || "n/a")}</strong> (${selectedFrictionPack?.items?.length || 0} subcategories, ${selectedFrictionPackRunnableScenarios.length} automated scripts)</p>
      </section>

      <section class="wizard-card">
        <h3>Scenario Coverage</h3>
        <div class="metric-grid metric-grid--2">
          <div class="metric">
            <span>Planned Behaviors</span>
            <strong>${behaviorPlannedCount}/${SCENARIO_TARGETS.behavior}</strong>
            <small>${coveragePct(behaviorPlannedCount, SCENARIO_TARGETS.behavior)} of target</small>
          </div>
          <div class="metric">
            <span>Planned Frictions</span>
            <strong>${frictionPlannedCount}/${SCENARIO_TARGETS.friction}</strong>
            <small>${coveragePct(frictionPlannedCount, SCENARIO_TARGETS.friction)} of target</small>
          </div>
          <div class="metric">
            <span>Detected Frictions</span>
            <strong>${frictionDetectedCount}/${SCENARIO_TARGETS.friction}</strong>
            <small>${coveragePct(frictionDetectedCount, SCENARIO_TARGETS.friction)} observed via backend</small>
          </div>
          <div class="metric">
            <span>Run Pass Rate</span>
            <strong>${scenarioPassCount}/${scenarioRunTotal}</strong>
            <small>${coveragePct(scenarioPassCount, scenarioRunTotal || 1)} passed</small>
          </div>
        </div>
      </section>

      <section class="wizard-card">
        <h3>Scenario Results</h3>
        <div class="scenario-results-list">${renderRecentResults()}</div>
      </section>

      <section class="wizard-card">
        <h3>Live Run Log</h3>
        <div class="scenario-log">${renderRecentLogs()}</div>
      </section>

      <section class="wizard-card status ${state.error ? "is-error" : "is-ok"}">
        <h3>Status</h3>
        <p>${escapeHtml(state.error || state.message)}</p>
      </section>
    `;
  };

  render();
  startScenarioHeartbeat();

  // On wizard load, reset the demo store to dormant so every demo session starts clean.
  // Fire-and-forget — no await, failure is non-critical.
  api("/api/site/reset?siteUrl=" + encodeURIComponent(state.siteUrl), { method: "POST" })
    .then(() => {
      const storeFrame = options.getStoreFrame?.();
      if (storeFrame) storeFrame.src = storeFrame.src;
    })
    .catch(() => { /* server may not be ready yet — harmless */ });

  return {
    destroy() {
      stopPolling();
      stopScenarioHeartbeat();
      root.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
      window.removeEventListener("message", handleStoreMessage);
      pendingScenarioRuns.forEach((pending) => clearTimeout(pending.timeoutId));
      pendingScenarioRuns.clear();
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
