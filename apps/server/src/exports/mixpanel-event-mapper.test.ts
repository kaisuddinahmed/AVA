// ============================================================================
// mixpanel-event-mapper — Phase 4.4 unit tests.
//
// Asserts (Codex-mandated):
//   - $insert_id is STABLE across calls with the same input
//   - $insert_id prefers AVA's eventId when supplied
//   - governance fields ($source=ava, ava_source=server_export) present
//   - 5-day-old timestamps replace `time` with now, preserve original
//     under `ava_original_time` (no silent clamping)
//   - page_location is URL-PII-stripped
//   - signal flattening doesn't overwrite reserved properties
// ============================================================================

import { describe, it, expect } from "vitest";
import { mapAvaEventToMixpanel, resolveInsertId } from "./mixpanel-event-mapper.js";

const TOKEN = "test_token";
const NOW = 1_750_000_000_000; // fixed ms timestamp for deterministic tests

// ── $insert_id stability ───────────────────────────────────────────────────

describe("resolveInsertId — Codex-mandated stability", () => {
  it("prefers AVA's eventId when supplied", () => {
    expect(resolveInsertId({ eventType: "page_view", eventId: "evt_abc" })).toBe("evt_abc");
  });

  it("produces the SAME id across calls when stable fields match (dedup works)", () => {
    const event = { eventType: "page_view", siteUrl: "https://x", sessionId: "s1", timestamp: NOW };
    const a = resolveInsertId(event);
    const b = resolveInsertId({ ...event });
    expect(a).toBe(b);
    expect(a).toMatch(/^ava_[a-f0-9]+$/);
  });

  it("changes when any stable field changes", () => {
    const base = { eventType: "page_view", siteUrl: "https://x", sessionId: "s1", timestamp: NOW };
    const a = resolveInsertId(base);
    expect(resolveInsertId({ ...base, sessionId: "s2" })).not.toBe(a);
    expect(resolveInsertId({ ...base, timestamp: NOW + 1 })).not.toBe(a);
    expect(resolveInsertId({ ...base, eventType: "click" })).not.toBe(a);
  });

  it("does NOT generate a random/UUID id (would break Mixpanel dedup on retry)", () => {
    const event = { eventType: "page_view" };
    const a = resolveInsertId(event);
    const b = resolveInsertId(event);
    // Even with no stable fields, the hash of "||||" is deterministic.
    expect(a).toBe(b);
  });
});

// ── Required + governance fields ───────────────────────────────────────────

describe("mapAvaEventToMixpanel — required + governance fields", () => {
  it("injects token, time (unix seconds), $insert_id, $source, ava_source", () => {
    const out = mapAvaEventToMixpanel(
      { eventType: "page_view", timestamp: NOW },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.token).toBe(TOKEN);
    expect(out.properties.time).toBe(Math.floor(NOW / 1000));
    expect(out.properties.$source).toBe("ava");
    expect(out.properties.ava_source).toBe("server_export");
    expect(out.properties.$insert_id).toMatch(/^ava_[a-f0-9]+$/);
  });

  it("maps visitorId → distinct_id for Mixpanel user threading", () => {
    const out = mapAvaEventToMixpanel(
      { eventType: "click", visitorId: "anon_xyz" },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.distinct_id).toBe("anon_xyz");
  });

  it("preserves event name verbatim (Mixpanel has looser rules than GA4)", () => {
    const out = mapAvaEventToMixpanel(
      { eventType: "Add to Cart!" },
      { token: TOKEN, now: NOW },
    );
    expect(out.event).toBe("Add to Cart!");
  });
});

// ── 5-day-old timestamp handling (Codex nice-to-have, treated as required) ─

describe("mapAvaEventToMixpanel — old timestamp handling", () => {
  it("REPLACES `time` with now when input is older than 5 days, preserving original", () => {
    const tenDaysAgo = NOW - 10 * 24 * 60 * 60 * 1000;
    const out = mapAvaEventToMixpanel(
      { eventType: "page_view", timestamp: tenDaysAgo },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.time).toBe(Math.floor(NOW / 1000));
    expect(out.properties.ava_original_time).toBe(tenDaysAgo);
  });

  it("does NOT replace recent timestamps", () => {
    const oneHourAgo = NOW - 60 * 60 * 1000;
    const out = mapAvaEventToMixpanel(
      { eventType: "page_view", timestamp: oneHourAgo },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.time).toBe(Math.floor(oneHourAgo / 1000));
    expect(out.properties.ava_original_time).toBeUndefined();
  });

  it("defaults to `now` when no timestamp supplied", () => {
    const out = mapAvaEventToMixpanel(
      { eventType: "page_view" },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.time).toBe(Math.floor(NOW / 1000));
  });
});

// ── URL PII strip on page_location (reuses Phase 4.3 helper) ───────────────

describe("mapAvaEventToMixpanel — URL PII strip", () => {
  it("strips query strings from page_location", () => {
    const out = mapAvaEventToMixpanel(
      {
        eventType: "page_view",
        pageUrl: "https://shop.example/checkout?email=leak@x.com&phone=555",
      },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.page_location).toBe("https://shop.example/checkout");
    expect(out.properties.page_location as string).not.toContain("email");
    expect(out.properties.page_location as string).not.toContain("phone");
  });
});

// ── Signal flattening ──────────────────────────────────────────────────────

describe("mapAvaEventToMixpanel — signal flattening", () => {
  it("flattens signals into properties", () => {
    const out = mapAvaEventToMixpanel(
      { eventType: "click", signals: { cart_value: 99, x_pct: 0.5 } },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.cart_value).toBe(99);
    expect(out.properties.x_pct).toBe(0.5);
  });

  it("does NOT let signals overwrite reserved properties (token, time, $insert_id, etc.)", () => {
    const out = mapAvaEventToMixpanel(
      {
        eventType: "click",
        signals: {
          token: "evil",
          time: 0,
          $insert_id: "fake",
          $source: "not_ava",
        },
      },
      { token: TOKEN, now: NOW },
    );
    expect(out.properties.token).toBe(TOKEN);
    expect(out.properties.time).toBe(Math.floor(NOW / 1000));
    expect(out.properties.$source).toBe("ava");
    expect((out.properties.$insert_id as string).startsWith("ava_")).toBe(true);
  });
});
