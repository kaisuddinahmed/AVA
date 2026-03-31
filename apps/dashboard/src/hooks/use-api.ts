import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = "http://localhost:8080/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Stable polling hook — load() is created once and never recreated.
 * Path and pollMs control when the effect restarts; a ref keeps load()
 * current without adding it to dependency arrays.
 */
export function useApi<T>(
  path: string | null,
  opts?: { pollMs?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always-current ref — no stale-closure risk, no dep-array churn
  const pathRef = useRef<string | null>(path);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Sync ref every render (synchronously, before effects run)
  pathRef.current = path;

  // Stable load function — zero deps, reads path from ref
  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const result = await apiFetch<T>(p);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []); // intentionally empty — stability is the point

  useEffect(() => {
    if (!path) {
      clearInterval(timerRef.current);
      return;
    }
    load();
    if (opts?.pollMs) {
      timerRef.current = setInterval(load, opts.pollMs);
    }
    return () => {
      clearInterval(timerRef.current);
    };
  }, [path, opts?.pollMs]); // load is stable — intentionally omitted

  return { data, error, reload: load };
}

export { apiFetch };
