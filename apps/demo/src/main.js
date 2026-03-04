import "./styles.css";
import { createIntegrationWizard } from "./components/integration-wizard.js";

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div class="layout" id="layout">
    <!-- Left Panel: Integration Wizard -->
    <aside class="panel panel--left" id="panel-left">
      <button class="panel-toggle" id="toggle-left" title="Toggle wizard panel">&#8249;</button>
      <div class="panel-content">
        <header class="pane-header">
          <p class="eyebrow">AVA Demo</p>
          <h1>Integration Wizard</h1>
          <p class="subtext">Analyze &rarr; Map &rarr; Verify &rarr; Activate</p>
        </header>
        <section id="wizard-root"></section>
      </div>
    </aside>

    <!-- Center Panel: Demo Store -->
    <main class="panel panel--center">
      <section class="frame-card">
        <div class="card-header">
          <h2>Demo Store</h2>
          <span class="hint">Customer journey view</span>
        </div>
        <iframe title="Demo Store" src="http://localhost:3001"></iframe>
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
          <iframe title="Dashboard" src="http://localhost:3000"></iframe>
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

// ── Initialize Wizard ───────────────────────────────────

const wizardRoot = document.getElementById("wizard-root");
if (!wizardRoot) {
  throw new Error("Missing #wizard-root element");
}

createIntegrationWizard(wizardRoot, {
  apiBaseUrl: "http://localhost:8080",
  onActivated: () => {
    // 1. Notify dashboard to unlock its UI
    const dashboardIframe = document.querySelector(
      '.panel--right iframe[title="Dashboard"]'
    );
    if (dashboardIframe) {
      dashboardIframe.contentWindow.postMessage(
        { type: "ava:activate" },
        "*"
      );
    }
    // 2. Reload the store iframe so the widget re-runs its activation gate
    //    (the gate check fires once at page load; reload is needed to pick up the new status)
    const storeIframe = document.querySelector(
      '.panel--center iframe[title="Demo Store"]'
    );
    if (storeIframe) {
      storeIframe.src = storeIframe.src;
    }
  },
});
