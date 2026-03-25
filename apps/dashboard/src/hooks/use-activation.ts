import { useState, useEffect, useRef } from "react";

export type ActivationState = {
  activated: boolean;
  /** ISO timestamp of when the dashboard was activated (for filtering stale data) */
  activatedAt: string | null;
};

const STORAGE_KEY = "ava:activatedAt";
const BC_CHANNEL = "ava:activation";

const API_BASE = "http://localhost:8080/api";
const DEMO_SITE_URL = "http://localhost:3001";
const DEMO_SITE_KEY = "avak_eff0c37fabe8d527";
const SERVER_POLL_MS = 5000;

/**
 * Dashboard activation hook — syncs embedded (port 4002 sidebar) and
 * standalone (port 3000) dashboards via four redundant channels:
 *
 *  Channel 1 — postMessage: wizard (4002) → embedded dashboard iframe.
 *  Channel 2 — BroadcastChannel: iframe → all same-origin tabs/iframes.
 *  Channel 3 — localStorage "storage" event: fallback cross-tab relay.
 *  Channel 4 — Server polling: GET /api/site/status — works cross-origin,
 *               enables standalone dashboard (port 3000) to detect when
 *               the standalone wizard (port 3002) activates via the server.
 *
 * All channels funnel into one idempotent `activate()` — the first one
 * that fires wins, subsequent calls are no-ops (via activatedRef guard).
 *
 * The dashboard always starts inactive on page load. Activation is exclusively
 * triggered by the integration wizard — never auto-restored from storage or
 * inferred from server state on mount.
 */
export function useActivation(): ActivationState {
  const [state, setState] = useState<ActivationState>({
    activated: false,
    activatedAt: null,
  });

  const activatedRef = useRef(false);

  useEffect(() => {
    // ── BroadcastChannel (reliable cross-context, same-origin) ─────────
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel(BC_CHANNEL); } catch { /* Safari < 15.4 */ }

    function activate(activatedAt: string, broadcast: boolean) {
      if (activatedRef.current) return;
      activatedRef.current = true;
      setState({ activated: true, activatedAt });

      // Relay to other contexts via both localStorage AND BroadcastChannel
      if (broadcast) {
        try { localStorage.setItem(STORAGE_KEY, activatedAt); } catch { /* ignore */ }
        try { bc?.postMessage({ activatedAt }); } catch { /* ignore */ }
      }
    }

    // ── Always start inactive — activation must come from the wizard ───────
    // Clear any stale activation so every page load begins in the dormant state.
    // The wizard fires the activation signal (Channel 1 postMessage in 4002,
    // Channel 4 server poll for standalone 3000) — never auto-restore here.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    // ── Channel 1: postMessage from demo wizard → embedded dashboard ──
    function onPostMessage(event: MessageEvent) {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "ava:activate"
      ) {
        // Use the real activation time — analytics components use their own
        // lookback window via overviewParams. The Live Feed must only show
        // events from THIS demo run, not the past 24 hours.
        const since = new Date().toISOString();
        activate(since, true);
      }
    }

    // ── Channel 2: BroadcastChannel from iframe → standalone tab ──
    if (bc) {
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.activatedAt) {
          activate(event.data.activatedAt, false);
        }
      };
    }

    // ── Channel 3: storage event (fallback for environments without BC) ──
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && event.newValue) {
        activate(event.newValue, false);
      }
    }

    // ── Channel 4: Server polling — cross-origin fallback for standalone mode ──
    // BroadcastChannel and localStorage are same-origin only, so when the wizard
    // runs at port 3002 and the dashboard at port 3000, neither channel fires.
    // Polling the server directly bridges the cross-origin gap.
    let serverPollTimer: ReturnType<typeof setInterval> | null = null;
    async function pollServerStatus() {
      if (activatedRef.current) return;
      try {
        const res = await fetch(
          `${API_BASE}/site/status?siteUrl=${encodeURIComponent(DEMO_SITE_URL)}&siteKey=${DEMO_SITE_KEY}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.activated) {
          const since = new Date().toISOString();
          activate(since, true);
          if (serverPollTimer) clearInterval(serverPollTimer);
        }
      } catch { /* server not ready yet — harmless */ }
    }
    serverPollTimer = setInterval(pollServerStatus, SERVER_POLL_MS);
    // Kick off an immediate check so there's no initial 5s delay
    pollServerStatus();

    window.addEventListener("message", onPostMessage);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("message", onPostMessage);
      window.removeEventListener("storage", onStorage);
      try { bc?.close(); } catch { /* ignore */ }
      if (serverPollTimer) clearInterval(serverPollTimer);
    };
  }, []);

  return state;
}
