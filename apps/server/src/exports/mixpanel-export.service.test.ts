// ============================================================================
// mixpanel-export.service — Phase 4.4 unit tests.
//
// Asserts:
//   - empty input is a no-op (no adapter call)
//   - missing token is a no-op (no adapter call) — defensive
//   - composes scrub → map → adapter in order
//   - PII is stripped from per-event signals
//   - CRITICAL: adapter failures NEVER bubble to caller
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMixpanelPayload = vi.fn();
vi.mock("./mixpanel-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("./mixpanel-adapter.js")>("./mixpanel-adapter.js");
  return { ...actual, sendMixpanelPayload: (...args: unknown[]) => sendMixpanelPayload(...args) };
});

import { forwardToMixpanel } from "./mixpanel-export.service.js";

beforeEach(() => {
  sendMixpanelPayload.mockReset().mockResolvedValue({ provider: "console", endpoint: "console", eventCount: 0 });
});

// ── No-ops ─────────────────────────────────────────────────────────────────

describe("forwardToMixpanel — no-ops", () => {
  it("returns zeroed result and never calls adapter on empty input", async () => {
    const r = await forwardToMixpanel([], { token: "tok" });
    expect(r).toEqual({ attempted: 0, scrubbed: 0, succeeded: 0, failed: 0 });
    expect(sendMixpanelPayload).not.toHaveBeenCalled();
  });

  it("skips when token missing (logs + returns without firing adapter)", async () => {
    const r = await forwardToMixpanel([{ eventType: "click" }], { token: "" });
    expect(sendMixpanelPayload).not.toHaveBeenCalled();
    expect(r.succeeded).toBe(0);
    expect(r.failed).toBe(0);
  });
});

// ── Composition ────────────────────────────────────────────────────────────

describe("forwardToMixpanel — composition", () => {
  it("scrubs PII from signals before forwarding", async () => {
    await forwardToMixpanel(
      [{
        eventType: "checkout",
        signals: { email: "leak@x.com", cart_value: 99, note: "ping owner@shop.io please" },
      }],
      { token: "tok" },
    );
    const args = sendMixpanelPayload.mock.calls[0]![0] as { events: Array<{ properties: Record<string, unknown> }> };
    const props = args.events[0]!.properties;
    expect(props.email).toBeUndefined();
    expect(props.note).toBeUndefined();              // value-pattern matched
    expect(props.cart_value).toBe(99);
  });

  it("forwards the full mapped event to the adapter", async () => {
    await forwardToMixpanel(
      [{ eventType: "page_view", visitorId: "anon_xyz", timestamp: 1_750_000_000_000 }],
      { token: "tok", now: 1_750_000_000_000 },
    );
    const event = (sendMixpanelPayload.mock.calls[0]![0] as { events: Array<{ event: string; properties: Record<string, unknown> }> }).events[0]!;
    expect(event.event).toBe("page_view");
    expect(event.properties.token).toBe("tok");
    expect(event.properties.distinct_id).toBe("anon_xyz");
    expect(event.properties.$source).toBe("ava");
  });
});

// ── Codex-locked failure isolation ─────────────────────────────────────────

describe("forwardToMixpanel — failure isolation", () => {
  it("CRITICAL: adapter failures NEVER bubble to caller", async () => {
    sendMixpanelPayload.mockRejectedValue(new Error("mp down"));
    const r = await forwardToMixpanel([{ eventType: "click" }], { token: "tok" });
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(0);
  });

  it("CRITICAL: verbose-response validation failures NEVER bubble to caller", async () => {
    // The adapter throws on `{ status: 0 }` — make sure the service swallows it.
    sendMixpanelPayload.mockRejectedValue(new Error("Mixpanel validation rejected: bad token"));
    const r = await forwardToMixpanel([{ eventType: "click" }], { token: "tok" });
    expect(r.failed).toBe(1);
  });
});
