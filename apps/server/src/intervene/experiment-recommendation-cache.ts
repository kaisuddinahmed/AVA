// ============================================================================
// Experiment → Recommendation cache — Phase 4.1.
//
// Codex #3: caching is fine but MUST be TTL-bounded and ALWAYS fall back
// to repo lookup. Attribution is the money path; correctness beats micro-
// optimization. This cache only exists to avoid hammering the repo on every
// intervention fire — the source of truth is the database.
//
// Cache entries:
//   value = the Recommendation row (or null = miss confirmed by the repo)
//   expiresAt = monotonic ms timestamp
//
// On expiry the entry is dropped and the next call re-asks the repo.
// ============================================================================

export interface CachedRecommendation {
  id: string;
  frictionId: string;
  actionCode: string;
}

export interface RecommendationCacheOptions {
  /** TTL in ms. Default 60_000 (1 minute). */
  ttlMs?: number;
  /** Repo lookup the cache wraps. */
  fetch: (experimentId: string) => Promise<CachedRecommendation | null>;
  /** Time source — for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export interface RecommendationCache {
  get: (experimentId: string) => Promise<CachedRecommendation | null>;
  size: () => number;
  clear: () => void;
}

interface Entry {
  value: CachedRecommendation | null;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

export function createRecommendationCache(opts: RecommendationCacheOptions): RecommendationCache {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const store = new Map<string, Entry>();

  return {
    async get(experimentId: string) {
      const entry = store.get(experimentId);
      if (entry && entry.expiresAt > now()) {
        return entry.value;
      }
      // Miss or expired — fall back to repo. Cache both hits AND null
      // results so a non-recommendation experiment doesn't hammer the
      // repo on every fire.
      const fresh = await opts.fetch(experimentId);
      store.set(experimentId, { value: fresh, expiresAt: now() + ttlMs });
      return fresh;
    },
    size() { return store.size; },
    clear() { store.clear(); },
  };
}
