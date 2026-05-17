import { useCallback, useEffect, useRef, useState } from "react";
import { createPollController, type PollControllerEnv } from "./poll-controller";

const API_BASE = "http://localhost:8080/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Polling hook with tab-visibility awareness (Phase 3.5).
 *
 *   - When the document is visible: poll every `pollMs`.
 *   - When the document goes hidden: pause the timer (saves battery + spares
 *     the API while the merchant has switched tabs).
 *   - On visibility return: reload immediately so the dashboard isn't stale.
 *   - `lastUpdatedAt` is exposed so callers can render "Updated 4s ago".
 *
 * load() is stable across renders; `path` and `pollMs` restart the effect.
 */
export function useApi<T>(
  path: string | null,
  opts?: { pollMs?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Always-current ref — no stale-closure risk, no dep-array churn
  const pathRef = useRef<string | null>(path);
  pathRef.current = path;

  // Stable load function — zero deps, reads path from ref
  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const result = await apiFetch<T>(p);
      setData(result);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []); // intentionally empty — stability is the point

  useEffect(() => {
    if (!path) return;

    // Browser-only document hook. In node/SSR there is no `document`.
    const env: PollControllerEnv =
      typeof document !== "undefined"
        ? {
            isHidden: () => document.visibilityState === "hidden",
            addVisibilityListener: (fn) => document.addEventListener("visibilitychange", fn),
            removeVisibilityListener: (fn) => document.removeEventListener("visibilitychange", fn),
            setInterval: (fn, ms) => window.setInterval(fn, ms) as unknown as number,
            clearInterval: (id) => window.clearInterval(id),
          }
        : {
            isHidden: () => false,
            addVisibilityListener: () => {},
            removeVisibilityListener: () => {},
            setInterval: (fn, ms) => globalThis.setInterval(fn, ms) as unknown as number,
            clearInterval: (id) => globalThis.clearInterval(id),
          };

    const controller = createPollController({
      pollMs: opts?.pollMs ?? 0,
      onTick: () => { void load(); },
      env,
    });

    // Immediate load on mount + every restart.
    void load();
    controller.start();

    return () => controller.stop();
  }, [path, opts?.pollMs]); // load is stable — intentionally omitted

  return { data, error, reload: load, lastUpdatedAt };
}

export { apiFetch };
