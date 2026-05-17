// ============================================================================
// Phase 4.3.1 / 4.4.1 regression test — track.service forwards every
// TrackEvent to GA4 + Mixpanel as fire-and-forget.
//
// CLAUDE.md hard rule: analytics side-effects on the track hot path must
// NEVER `await` and NEVER throw. This test locks BOTH invariants:
//
//   1. forwardToGA4 + forwardToMixpanel are called once per processTrackEvent.
//   2. When EITHER (or BOTH) forwarders throw, processTrackEvent still
//      returns successfully and the rest of the pipeline runs.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const forwardToGA4 = vi.fn();
const forwardToMixpanel = vi.fn();

vi.mock("../exports/ga4-export.service.js", () => ({
  forwardToGA4: (...args: unknown[]) => forwardToGA4(...args),
}));
vi.mock("../exports/mixpanel-export.service.js", () => ({
  forwardToMixpanel: (...args: unknown[]) => forwardToMixpanel(...args),
}));

// Stub @ava/db so the hot path doesn't touch a real DB.
vi.mock("@ava/db", () => ({
  EventRepo: {
    createEvent: vi.fn(async () => ({ id: "evt_1" })),
  },
  InterventionRepo: {},
  SessionRepo: {
    incrementPageViews: vi.fn().mockResolvedValue({}),
    setEntryPage: vi.fn().mockResolvedValue({}),
    setExitPage: vi.fn().mockResolvedValue({}),
    accumulateTimeOnSite: vi.fn().mockResolvedValue({}),
    getSession: vi.fn().mockResolvedValue({ entryPage: "/" }),
  },
}));

// Stub modules transitively imported by track.service.ts so the import
// graph resolves without spinning up a real evaluator / broadcaster.
vi.mock("./session-manager.js", () => ({
  getOrCreateSession: vi.fn(async () => "session_1"),
  updateSessionCart: vi.fn().mockResolvedValue({}),
}));
vi.mock("../evaluate/evaluate.service.js", () => ({
  evaluateEventBatch: vi.fn().mockResolvedValue(null),
}));
vi.mock("../intervene/intervene.service.js", () => ({
  handleDecision: vi.fn(),
  recordInterventionOutcome: vi.fn().mockResolvedValue({}),
}));
vi.mock("../evaluate/decision-engine.js", () => ({
  makeDecision: vi.fn(),
}));
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToChannel: vi.fn(),
}));

import { processTrackEvent } from "./track.service.js";

beforeEach(() => {
  forwardToGA4.mockReset().mockResolvedValue({ attempted: 1, scrubbed: 0, batches: 1, succeeded: 1, failed: 0 });
  forwardToMixpanel.mockReset().mockResolvedValue({ attempted: 1, scrubbed: 0, succeeded: 1, failed: 0 });
});

const SESSION_DATA = {
  siteUrl: "https://shop.example",
  deviceType: "desktop",
  referrerType: "direct",
};

// Use the field shape the event-normalizer actually reads: top-level
// camelCase keys OR a nested `page_context` object. snake_case top-level
// keys (page_url, page_type, event_type) are NOT what the widget emits.
const RAW_EVENT = {
  event_type: "page_view",          // event-normalizer reads this OR eventType
  pageUrl: "https://shop.example/pdp/abc",
  pageType: "pdp",
  category: "navigation",
  raw_signals: { scroll_depth: 0.5 },
};

// ── Forward-on-every-event invariant ───────────────────────────────────────

describe("track.service → analytics forwarders (Phase 4.3.1 / 4.4.1)", () => {
  it("calls BOTH forwardToGA4 and forwardToMixpanel exactly once per event", async () => {
    await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    expect(forwardToGA4).toHaveBeenCalledTimes(1);
    expect(forwardToMixpanel).toHaveBeenCalledTimes(1);
  });

  it("forwards visitor + session identity + URL to GA4 as clientId / event payload", async () => {
    await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    const [events, opts] = forwardToGA4.mock.calls[0] as [Array<Record<string, unknown>>, { clientId: string }];
    expect(opts.clientId).toBe("visitor_xyz");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      visitorId: "visitor_xyz",
      sessionId: "session_1",
      siteUrl: "https://shop.example",
      pageUrl: "https://shop.example/pdp/abc",
      pageType: "pdp",
      category: "navigation",
      eventType: "page_view",
    });
    expect(events[0]!.eventId).toBe("evt_1");
  });

  it("forwards the same payload to Mixpanel with token from MIXPANEL_PROJECT_TOKEN env", async () => {
    process.env.MIXPANEL_PROJECT_TOKEN = "mp_test_token";
    try {
      await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
      const [events, opts] = forwardToMixpanel.mock.calls[0] as [Array<Record<string, unknown>>, { token: string }];
      expect(opts.token).toBe("mp_test_token");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ visitorId: "visitor_xyz", sessionId: "session_1" });
    } finally {
      delete process.env.MIXPANEL_PROJECT_TOKEN;
    }
  });
});

// ── Hot-path safety: forwarder failures NEVER bubble ───────────────────────

describe("track.service → forwarder failures are swallowed", () => {
  it("GA4 forwarder throws → processTrackEvent still returns successfully", async () => {
    forwardToGA4.mockRejectedValue(new Error("ga4 down"));
    const r = await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    expect(r).toMatchObject({ sessionId: "session_1", eventId: "evt_1" });
  });

  it("Mixpanel forwarder throws → processTrackEvent still returns successfully", async () => {
    forwardToMixpanel.mockRejectedValue(new Error("mp down"));
    const r = await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    expect(r).toMatchObject({ sessionId: "session_1", eventId: "evt_1" });
  });

  it("BOTH forwarders throw → processTrackEvent still returns successfully", async () => {
    forwardToGA4.mockRejectedValue(new Error("ga4 down"));
    forwardToMixpanel.mockRejectedValue(new Error("mp down"));
    const r = await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    expect(r).toMatchObject({ sessionId: "session_1", eventId: "evt_1" });
  });

  it("CLAUDE.md hot-path rule: the call is non-awaited (returns synchronously vs. forwarder)", async () => {
    // Configure both forwarders to return a slow promise. If track.service
    // awaited them, processTrackEvent would take >100ms. The fire-and-forget
    // pattern means processTrackEvent must complete first regardless.
    let resolveGA4: () => void = () => {};
    let resolveMP: () => void = () => {};
    forwardToGA4.mockReturnValue(new Promise<void>((r) => { resolveGA4 = r; }));
    forwardToMixpanel.mockReturnValue(new Promise<void>((r) => { resolveMP = r; }));

    const start = Date.now();
    const r = await processTrackEvent("visitor_xyz", SESSION_DATA, RAW_EVENT);
    const elapsed = Date.now() - start;

    // Without await, this should be <50ms even on a slow CI box.
    expect(elapsed).toBeLessThan(100);
    expect(r.eventId).toBe("evt_1");

    // Cleanup the still-pending promises.
    resolveGA4(); resolveMP();
  });
});
