import "./styles.css";

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div class="layout" id="layout">
    <!-- Left Panel: Integration Wizard (embedded from port 3002) -->
    <aside class="panel panel--left" id="panel-left">
      <button class="panel-toggle" id="toggle-left" title="Toggle wizard panel">&#8249;</button>
      <div class="panel-content panel-content--iframe">
        <iframe
          id="wizard-frame"
          title="Integration Wizard"
          src="http://localhost:3002"
          style="width:100%;height:100%;border:none;display:block;"
          allow="clipboard-write"
        ></iframe>
      </div>
    </aside>

    <!-- Center Panel: Demo Store -->
    <main class="panel panel--center">
      <section class="frame-card">
        <div class="card-header">
          <h2>Demo Store</h2>
          <span class="hint">Customer journey view</span>
          <button id="store-refresh-btn" title="Refresh store only" style="margin-left:auto;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px;white-space:nowrap;">&#x21BB; Refresh Store</button>
        </div>
        <iframe id="store-frame" title="Demo Store" src="http://localhost:3001" allow="microphone; camera; clipboard-write" style="width:100%;height:100%;border:none;display:block;"></iframe>
      </section>
    </main>

    <!-- Right Panel: Dashboard -->
    <aside class="panel panel--right" id="panel-right">
      <button class="panel-toggle" id="toggle-right" title="Toggle dashboard panel">&#8250;</button>
      <div class="panel-content">
        <section class="frame-card">
          <div class="card-header">
            <h2>Dashboard</h2>
            <span class="hint">Backend analysis + intervention feed</span>
          </div>
          <iframe id="dashboard-frame" title="Dashboard" src="http://localhost:3000" allow="clipboard-write" style="width:100%;height:100%;border:none;display:block;"></iframe>
        </section>
      </div>
    </aside>
  </div>
`;

// ── Panel Toggle Logic ──────────────────────────────────

function setupPanelToggle(panelId, toggleId, side) {
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  const layout = document.getElementById("layout");
  if (!panel || !toggle || !layout) return;

  const storageKey = `ava-demo-panel-${side}`;

  // Arrows: left panel uses ‹/› , right panel uses ›/‹
  const arrowExpanded = side === "left" ? "\u2039" : "\u203A"; // ‹ or ›
  const arrowCollapsed = side === "left" ? "\u203A" : "\u2039"; // › or ‹

  // Restore persisted state
  const saved = localStorage.getItem(storageKey);
  if (saved === "collapsed") {
    panel.classList.add("collapsed");
    toggle.innerHTML = arrowCollapsed;
  } else {
    toggle.innerHTML = arrowExpanded;
  }

  toggle.addEventListener("click", () => {
    const isCollapsed = panel.classList.contains("collapsed");

    // Block iframe pointer-events during transition
    layout.classList.add("transitioning");
    setTimeout(() => layout.classList.remove("transitioning"), 320);

    if (isCollapsed) {
      panel.classList.remove("collapsed");
      toggle.innerHTML = arrowExpanded;
      localStorage.setItem(storageKey, "expanded");
    } else {
      panel.classList.add("collapsed");
      toggle.innerHTML = arrowCollapsed;
      localStorage.setItem(storageKey, "collapsed");
    }
  });
}

setupPanelToggle("panel-left", "toggle-left", "left");
setupPanelToggle("panel-right", "toggle-right", "right");

// ── Responsive: auto-collapse on small viewports ────────

const mql = window.matchMedia("(max-width: 1080px)");
function handleViewport(e) {
  const leftPanel = document.getElementById("panel-left");
  const rightPanel = document.getElementById("panel-right");
  const leftToggle = document.getElementById("toggle-left");
  const rightToggle = document.getElementById("toggle-right");

  if (e.matches) {
    // Small screen: collapse both
    leftPanel?.classList.add("collapsed");
    rightPanel?.classList.add("collapsed");
    if (leftToggle) leftToggle.innerHTML = "\u203A";
    if (rightToggle) rightToggle.innerHTML = "\u2039";
  } else {
    // Wide screen: restore from localStorage (default expanded)
    const leftSaved = localStorage.getItem("ava-demo-panel-left");
    const rightSaved = localStorage.getItem("ava-demo-panel-right");

    if (leftSaved !== "collapsed") {
      leftPanel?.classList.remove("collapsed");
      if (leftToggle) leftToggle.innerHTML = "\u2039";
    }
    if (rightSaved !== "collapsed") {
      rightPanel?.classList.remove("collapsed");
      if (rightToggle) rightToggle.innerHTML = "\u203A";
    }
  }
}
mql.addEventListener("change", handleViewport);
handleViewport(mql);

// ── Cross-Origin Message Proxy ───────────────────────────
//
// The wizard (port 3002) and store (port 3001) are in separate iframes and
// cannot communicate directly. This demo page (port 4002) acts as a trusted
// bridge, forwarding messages between them.
//
// Message flows:
//   wizard → demo  (ava:proxy:to-store)  → store
//   store  → demo  (ava-store-scenario)  → wizard
//   wizard → demo  (ava:wizard:activated) → dashboard + reload store

const getWizardFrame = () => document.getElementById("wizard-frame");
const getStoreFrame = () => document.getElementById("store-frame");
const getDashboardFrame = () => document.getElementById("dashboard-frame");

// Helper: reload the store iframe with ?ava_fresh=1 so the widget clears
// its sessionStorage welcome lock and re-fires the welcome voice.
function reloadStore(f) {
  if (!f) return;
  try {
    const url = new URL(f.src);
    url.searchParams.set("ava_fresh", "1");
    f.src = url.toString();
  } catch {
    f.src = f.src;
  }
}

// Refresh Store button
const refreshBtn = document.getElementById("store-refresh-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => reloadStore(getStoreFrame()));
}

window.addEventListener("message", (event) => {
  // Accept messages from known local origins + same-origin
  const allowedOrigins = [
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3000",
    window.location.origin,
  ];
  if (!allowedOrigins.includes(event.origin) && event.origin !== "") return;

  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  // ── Wizard → Store: scenario control & widget commands ──────────────────
  if (msg.type === "ava:proxy:to-store") {
    const storeFrame = getStoreFrame();
    if (storeFrame?.contentWindow) {
      storeFrame.contentWindow.postMessage(msg.payload, "*");
    }
    return;
  }

  // ── Store → Wizard: scenario results & status updates ───────────────────
  if (
    msg.source === "ava-store-scenario" ||
    msg.type === "ava:store:scenario-result" ||
    msg.type === "ava:store:ready"
  ) {
    const wizardFrame = getWizardFrame();
    if (wizardFrame?.contentWindow) {
      wizardFrame.contentWindow.postMessage(msg, "*");
    }
    return;
  }

  // ── Wizard → Demo: reset site to dormant, reload store ──────────────────
  if (msg.type === "ava:wizard:reset") {
    reloadStore(getStoreFrame());
    return;
  }

  // ── Wizard → All: activation complete ───────────────────────────────────
  if (msg.type === "ava:wizard:activated") {
    // Unlock dashboard UI
    const dashboardFrame = getDashboardFrame();
    if (dashboardFrame?.contentWindow) {
      dashboardFrame.contentWindow.postMessage({ type: "ava:activate" }, "*");
    }

    // Reload store so widget re-runs its activation gate and appears
    reloadStore(getStoreFrame());
    return;
  }
});
