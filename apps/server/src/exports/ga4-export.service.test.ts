// ============================================================================
// ga4-export.service — Phase 4.3 unit tests.
//
// Asserts:
//   - empty input is a no-op (no network call)
//   - composes scrub → map → adapter in order
//   - splits >25 events into multiple batches
//   - adapter failure NEVER propagates to caller (Codex change #2)
//   - per-batch failure isolation (one bad batch doesn't kill the rest)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGA4Payload = vi.fn();
vi.mock("./ga4-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("./ga4-adapter.js")>("./ga4-adapter.js");
  return { ...actual, sendGA4Payload: (...args: unknown[]) => sendGA4Payload(...args) };
});

import { forwardToGA4 } from "./ga4-export.service.js";

beforeEach(() => {
  sendGA4Payload.mockReset().mockResolvedValue({ provider: "console", endpoint: "console", eventCount: 0 });
});

// ── Empty input ────────────────────────────────────────────────────────────

describe("forwardToGA4 — empty input", () => {
  it("returns a zeroed result and never calls the adapter", async () => {
    const r = await forwardToGA4([], { clientId: "v1" });
    expect(r).toEqual({ attempted: 0, scrubbed: 0, batches: 0, succeeded: 0, failed: 0 });
    expect(sendGA4Payload).not.toHaveBeenCalled();
  });
});

// ── Pipeline composition ───────────────────────────────────────────────────

describe("forwardToGA4 — composition", () => {
  it("scrubs PII signals before forwarding", async () => {
    await forwardToGA4(
      [{
        eventType: "page_view",
        sessionId: "s1",
        signals: { email: "leak@x.com", session_id: "s1", title: "Cool" },
      }],
      { clientId: "v1" },
    );
    const args = sendGA4Payload.mock.calls[0]![0] as { events: { params: Record<string, unknown> }[] };
    // `email` must NOT appear; `title` survived because it isn't PII-named.
    const params = args.events[0]!.params;
    expect(params.email).toBeUndefined();
    expect(params.title).toBe("Cool");
  });

  it("preserves Codex-mandated params (session_id, engagement_time_msec, page_location, visitor_id)", async () => {
    await forwardToGA4(
      [{
        eventType: "page_view",
        sessionId: "s1",
        visitorId: "anon_xyz",
        pageUrl: "https://shop.example/pdp/x",
        engagementTimeMs: 800,
      }],
      { clientId: "anon_xyz" },
    );
    const event = (sendGA4Payload.mock.calls[0]![0] as { events: { params: Record<string, unknown> }[] }).events[0]!;
    expect(event.params).toMatchObject({
      session_id: "s1",
      page_location: "https://shop.example/pdp/x",
      visitor_id: "anon_xyz",
      engagement_time_msec: 800,
    });
  });
});

// ── Batching ───────────────────────────────────────────────────────────────

describe("forwardToGA4 — batching", () => {
  it("splits >25 events across multiple adapter calls", async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({ eventType: `e${i}` }));
    const r = await forwardToGA4(events, { clientId: "v1" });
    expect(sendGA4Payload).toHaveBeenCalledTimes(3);
    expect(r.batches).toBe(3);
    expect(r.succeeded).toBe(3);
  });
});

// ── Failure isolation (Codex change #2) ────────────────────────────────────

describe("forwardToGA4 — failure isolation", () => {
  it("CRITICAL: adapter failures NEVER bubble to caller", async () => {
    sendGA4Payload.mockRejectedValue(new Error("ga4 down"));
    // The test passes if this `await` does not throw.
    const r = await forwardToGA4(
      [{ eventType: "page_view" }],
      { clientId: "v1" },
    );
    expect(r.attempted).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(0);
  });

  it("per-batch isolation: one bad batch does not kill subsequent batches", async () => {
    // 2 batches: first rejects, second succeeds.
    sendGA4Payload
      .mockRejectedValueOnce(new Error("first batch down"))
      .mockResolvedValueOnce({ provider: "console", endpoint: "console", eventCount: 1 });
    const events = Array.from({ length: 26 }, (_, i) => ({ eventType: `e${i}` }));
    const r = await forwardToGA4(events, { clientId: "v1" });
    expect(r.batches).toBe(2);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
  });
});
