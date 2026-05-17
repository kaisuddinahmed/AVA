// ============================================================================
// ga4-event-mapper — Phase 4.3 unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import { mapAvaEventToGA4, batchForGA4, sanitiseEventName, stripUrlPII } from "./ga4-event-mapper.js";

// ── Event-name sanitisation ────────────────────────────────────────────────

describe("sanitiseEventName", () => {
  it("lowercases and replaces invalid chars with underscore", () => {
    expect(sanitiseEventName("Page View")).toBe("page_view");
    expect(sanitiseEventName("add-to-cart!")).toBe("add_to_cart_");
  });
  // Codex P1 fix: GA4 requires names start with a LETTER, not underscore.
  // Previously `_123_checkout` would have been silently rejected by GA4.
  it("prepends 'event_' when input starts with a digit (GA4 spec)", () => {
    expect(sanitiseEventName("404_error")).toBe("event_404_error");
  });
  it("prepends 'event_' when input starts with underscore", () => {
    expect(sanitiseEventName("_internal")).toBe("event__internal");
  });
  it("preserves names that already start with a letter", () => {
    expect(sanitiseEventName("checkout_complete")).toBe("checkout_complete");
  });
  it("truncates names to 40 chars", () => {
    const name = sanitiseEventName("a".repeat(60));
    expect(name).toHaveLength(40);
  });
  it("returns 'event' on empty input", () => {
    expect(sanitiseEventName("")).toBe("event");
  });
});

// ── Codex-mandated params present in output ────────────────────────────────

describe("mapAvaEventToGA4 — required params", () => {
  it("includes session_id, engagement_time_msec, page_location, visitor_id when supplied", () => {
    const out = mapAvaEventToGA4({
      eventType: "page_view",
      sessionId: "sess_abc",
      visitorId: "anon_xyz",
      pageUrl: "https://shop.example/pdp/blue-hoodie",
      engagementTimeMs: 1500,
    });
    expect(out.name).toBe("page_view");
    expect(out.params.session_id).toBe("sess_abc");
    expect(out.params.engagement_time_msec).toBe(1500);
    expect(out.params.page_location).toBe("https://shop.example/pdp/blue-hoodie");
    expect(out.params.visitor_id).toBe("anon_xyz");
  });

  it("omits engagement_time_msec when value is zero or missing", () => {
    const noTime = mapAvaEventToGA4({ eventType: "click" });
    expect(noTime.params.engagement_time_msec).toBeUndefined();
    const zero = mapAvaEventToGA4({ eventType: "click", engagementTimeMs: 0 });
    expect(zero.params.engagement_time_msec).toBeUndefined();
  });

  it("rounds engagement_time_msec to an integer", () => {
    const out = mapAvaEventToGA4({ eventType: "click", engagementTimeMs: 123.7 });
    expect(out.params.engagement_time_msec).toBe(124);
  });
});

// ── Param flattening from signals ──────────────────────────────────────────

describe("mapAvaEventToGA4 — signals flattening", () => {
  it("flattens scalar signals into params, sanitising names", () => {
    const out = mapAvaEventToGA4({
      eventType: "scroll",
      signals: { "Y-Pct": 0.42, depth: 3, isFold: true },
    });
    expect(out.params).toMatchObject({ y_pct: 0.42, depth: 3, is_fold: true });
  });

  it("drops nested objects/arrays (no JSON stringify into params)", () => {
    const out = mapAvaEventToGA4({
      eventType: "click",
      signals: { nested: { a: 1 }, list: [1, 2] },
    });
    expect(out.params.nested).toBeUndefined();
    expect(out.params.list).toBeUndefined();
  });

  it("truncates string param values to 100 chars", () => {
    const long = "x".repeat(200);
    const out = mapAvaEventToGA4({ eventType: "click", signals: { tag: long } });
    expect((out.params.tag as string).length).toBe(100);
  });

  it("never lets signals overwrite reserved params (session_id, etc.)", () => {
    const out = mapAvaEventToGA4({
      eventType: "click",
      sessionId: "real_session",
      signals: { session_id: "imposter" },
    });
    expect(out.params.session_id).toBe("real_session");
  });

  it("respects the 25-params-per-event cap (reserved params land first)", () => {
    const signals: Record<string, number> = {};
    for (let i = 0; i < 50; i++) signals[`extra_${i}`] = i;
    const out = mapAvaEventToGA4({
      eventType: "click",
      sessionId: "s1",
      engagementTimeMs: 100,
      pageUrl: "https://x",
      visitorId: "v1",
      signals,
    });
    expect(Object.keys(out.params).length).toBe(25);
    expect(out.params.session_id).toBe("s1");
    expect(out.params.visitor_id).toBe("v1");
  });
});

// ── Codex P1: URL PII strip on page_location ───────────────────────────────

describe("stripUrlPII", () => {
  it("drops the query string", () => {
    expect(stripUrlPII("https://shop.example/pdp?email=me@x.com")).toBe("https://shop.example/pdp");
  });
  it("drops the URL fragment", () => {
    expect(stripUrlPII("https://shop.example/pdp#section-2")).toBe("https://shop.example/pdp");
  });
  it("drops both query AND fragment", () => {
    expect(stripUrlPII("https://shop.example/pdp?phone=555-1234#x")).toBe("https://shop.example/pdp");
  });
  it("preserves pathname", () => {
    expect(stripUrlPII("https://shop.example/products/blue-hoodie")).toBe("https://shop.example/products/blue-hoodie");
  });
  it("falls back to regex strip when input is not a full URL", () => {
    expect(stripUrlPII("/checkout?token=abc")).toBe("/checkout");
  });
  it("returns clean input unchanged", () => {
    expect(stripUrlPII("/cart")).toBe("/cart");
  });
});

describe("mapAvaEventToGA4 — page_location does NOT leak query-string PII (Codex P1)", () => {
  it("strips ?email=… from page_location before forwarding", () => {
    const out = mapAvaEventToGA4({
      eventType: "page_view",
      pageUrl: "https://shop.example/checkout?email=leak@x.com&phone=555-1234",
    });
    expect(out.params.page_location).toBe("https://shop.example/checkout");
    expect(out.params.page_location as string).not.toContain("email");
    expect(out.params.page_location as string).not.toContain("phone");
  });
});

describe("mapAvaEventToGA4 — param names must start with a letter (Codex P1)", () => {
  it("prefixes digit-leading signal keys with 'param_'", () => {
    const out = mapAvaEventToGA4({
      eventType: "click",
      signals: { "1st_position": 42 },
    });
    // Key was "1st_position" → sanitised to "param_1st_position".
    expect(out.params.param_1st_position).toBe(42);
    expect(out.params["1st_position"]).toBeUndefined();
  });
});

// ── Batching ───────────────────────────────────────────────────────────────

describe("batchForGA4", () => {
  it("returns [] on empty input", () => {
    expect(batchForGA4([])).toEqual([]);
  });
  it("returns a single batch when ≤25 events", () => {
    const events = Array.from({ length: 25 }, (_, i) => ({ name: `e${i}`, params: {} }));
    expect(batchForGA4(events)).toHaveLength(1);
  });
  it("splits into chunks of 25", () => {
    const events = Array.from({ length: 60 }, (_, i) => ({ name: `e${i}`, params: {} }));
    const batches = batchForGA4(events);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(25);
    expect(batches[1]).toHaveLength(25);
    expect(batches[2]).toHaveLength(10);
  });
});
