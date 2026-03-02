import { useState, useEffect, useRef } from "react";

export type ActivationState = {
  activated: boolean;
  /** ISO timestamp of when the dashboard was activated (for filtering stale data) */
  activatedAt: string | null;
};

const STORAGE_KEY = "ava:activatedAt";
const BC_CHANNEL = "ava:activation";

/**
 * Dashboard activation hook — syncs embedded (port 4002 sidebar) and
 * standalone (port 3000) dashboards via three redundant channels:
 *
 *  Channel 1 — postMessage: wizard (4002) → embedded dashboard iframe.
 *  Channel 2 — BroadcastChannel: iframe → all same-origin tabs/iframes.
 *  Channel 3 — localStorage "storage" event: fallback cross-tab relay.
 *
 * All channels funnel into one idempotent `activate()` — the first one
 * that fires wins, subsequent calls are no-ops (via activatedRef guard).
 *
 * On mount the hook clears stale localStorage so the dashboard always
 * starts inactive; activation must come from the wizard each session.
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

    // ── Clear any stale activation on mount so the dashboard always starts inactive ──
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    // ── Channel 1: postMessage from demo wizard → embedded dashboard ──
    function onPostMessage(event: MessageEvent) {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "ava:activate"
      ) {
        // Backdate by 24 hours so existing evaluations/events from today are
        // included immediately — without showing data from previous days.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

    window.addEventListener("message", onPostMessage);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("message", onPostMessage);
      window.removeEventListener("storage", onStorage);
      try { bc?.close(); } catch { /* ignore */ }
    };
  }, []);

  return state;
}
