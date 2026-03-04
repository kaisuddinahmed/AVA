import "./styles.css";
import { createIntegrationWizard } from "./components/integration-wizard.js";

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app root element");

app.innerHTML = `
  <div class="wizard-shell">
    <header class="wizard-header">
      <p class="eyebrow">AVA</p>
      <h1>Integration Wizard</h1>
      <p class="subtext">Connect → Analyze → Activate → Validate</p>
    </header>
    <section id="wizard-root"></section>
  </div>
`;

const wizardRoot = document.getElementById("wizard-root");
if (!wizardRoot) throw new Error("Missing #wizard-root element");

createIntegrationWizard(wizardRoot, {
  apiBaseUrl: "http://localhost:8080",

  // Called after activation succeeds. Notifies parent (demo frame) to
  // unlock the dashboard and reload the store.
  onActivated: (activation) => {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "ava:wizard:activated", payload: activation },
        "*",
      );
    }
  },
});
