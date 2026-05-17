// ============================================================================
// experiment-recommendation-cache — Phase 4.1 unit tests.
//
// Asserts the Codex #3 invariant: TTL-bounded, always falls back to repo
// on expiry. Caches both hits AND null misses to keep non-recommendation
// experiments from re-querying the repo every intervention fire.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { createRecommendationCache } from "./experiment-recommendation-cache.js";

describe("createRecommendationCache", () => {
  it("calls the repo on first lookup and caches the hit", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "rec_1", frictionId: "F042", actionCode: "A" });
    const cache = createRecommendationCache({ fetch });
    expect(await cache.get("exp_1")).toMatchObject({ id: "rec_1" });
    expect(await cache.get("exp_1")).toMatchObject({ id: "rec_1" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });

  it("caches null misses too (so legacy experiments don't hammer the repo)", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const cache = createRecommendationCache({ fetch });
    expect(await cache.get("exp_legacy")).toBeNull();
    expect(await cache.get("exp_legacy")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires entries after TTL and re-queries the repo", async () => {
    let nowMs = 1_000_000;
    const fetch = vi.fn()
      .mockResolvedValueOnce({ id: "rec_v1", frictionId: "F042", actionCode: "A" })
      .mockResolvedValueOnce({ id: "rec_v2", frictionId: "F042", actionCode: "B" });
    const cache = createRecommendationCache({ fetch, ttlMs: 10_000, now: () => nowMs });

    expect(await cache.get("exp_1")).toMatchObject({ id: "rec_v1" });
    // Within TTL — cached.
    nowMs += 9_999;
    expect(await cache.get("exp_1")).toMatchObject({ id: "rec_v1" });
    expect(fetch).toHaveBeenCalledTimes(1);
    // After TTL — re-fetched, fresh value wins (e.g. recommendation got archived + replaced).
    nowMs += 2;
    expect(await cache.get("exp_1")).toMatchObject({ id: "rec_v2" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clear() drops everything", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "rec_1", frictionId: "F042", actionCode: "A" });
    const cache = createRecommendationCache({ fetch });
    await cache.get("exp_1");
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
    // Next get must re-fetch.
    await cache.get("exp_1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("isolates entries per experimentId", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ id: "rec_1", frictionId: "F042", actionCode: "A" })
      .mockResolvedValueOnce({ id: "rec_2", frictionId: "F100", actionCode: "B" });
    const cache = createRecommendationCache({ fetch });
    const a = await cache.get("exp_1");
    const b = await cache.get("exp_2");
    expect(a?.id).toBe("rec_1");
    expect(b?.id).toBe("rec_2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
