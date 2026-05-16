// ============================================================================
// voice-autofill — Phase 2.8 unit tests.
//
// Mocked LLM + repo. Privacy invariant: address content never appears in any
// logger arg (asserted via needle-string).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertAddressMock = vi.fn().mockResolvedValue({});
vi.mock("@ava/db", () => ({
  VisitorAddressRepo: {
    upsertAddress: (...args: unknown[]) => upsertAddressMock(...args),
  },
}));

const broadcasts: Array<{ ch: string; sid: string; msg: Record<string, unknown> }> = [];
vi.mock("../broadcast/broadcast.service.js", () => ({
  broadcastToSession: vi.fn((ch: string, sid: string, msg: Record<string, unknown>) => {
    broadcasts.push({ ch, sid, msg });
  }),
}));

import { logger } from "../logger.js";
const loggerCalls: unknown[][] = [];
for (const level of ["info", "warn", "error", "debug"] as const) {
  vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
    loggerCalls.push(args);
    return undefined as never;
  });
}
vi.spyOn(logger, "child").mockReturnValue(logger);

const {
  extractAddress,
  extractVariant,
  runVoiceAutofill,
  looksLikeAddress,
  looksLikeVariant,
} = await import("./voice-autofill.service.js");
import type { LlmClient } from "./voice-autofill.service.js";

function llmReturning(payload: unknown): LlmClient {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        })),
      },
    },
  };
}

beforeEach(() => {
  upsertAddressMock.mockClear().mockResolvedValue({});
  broadcasts.length = 0;
  loggerCalls.length = 0;
  process.env.VOICE_AUTOFILL_ENABLED = "true";
});

// ── Trigger heuristics ──────────────────────────────────────────────────────

describe("looksLikeAddress / looksLikeVariant", () => {
  it("detects shipping intent", () => {
    expect(looksLikeAddress("ship to 123 Main Street")).toBe(true);
    expect(looksLikeAddress("my shipping address is...")).toBe(true);
    expect(looksLikeAddress("deliver to apartment 5")).toBe(true);
    expect(looksLikeAddress("show me red shirts")).toBe(false);
  });

  it("detects variant intent", () => {
    expect(looksLikeVariant("size medium please")).toBe(true);
    expect(looksLikeVariant("in blue")).toBe(true);
    expect(looksLikeVariant("the XL one")).toBe(true);
    expect(looksLikeVariant("what's the return policy")).toBe(false);
  });
});

// ── Address extractor ──────────────────────────────────────────────────────

describe("extractAddress", () => {
  it("returns a validated address when the LLM produces one", async () => {
    const client = llmReturning({
      addressLine1: "123 Main St",
      addressLine2: null,
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
    });
    const addr = await extractAddress(
      "ship to 123 Main St San Francisco California 94105",
      { llmClient: client },
    );
    expect(addr).toMatchObject({
      addressLine1: "123 Main St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
    });
  });

  it("returns null when feature flag is off", async () => {
    process.env.VOICE_AUTOFILL_ENABLED = "false";
    const client = llmReturning({ addressLine1: "x", city: "y", state: "z", postalCode: "1" });
    expect(await extractAddress("ship to here", { llmClient: client })).toBeNull();
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns null when trigger keywords don't match (no LLM call)", async () => {
    const client = llmReturning({ addressLine1: "x" });
    expect(await extractAddress("show me sneakers", { llmClient: client })).toBeNull();
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns null when the LLM emits {_no_match: true}", async () => {
    const client = llmReturning({ _no_match: true });
    expect(await extractAddress("ship to somewhere", { llmClient: client })).toBeNull();
  });

  it("returns null when schema validation fails (partial address)", async () => {
    const client = llmReturning({ addressLine1: "123 Main", city: "SF" }); // missing state + postalCode
    expect(await extractAddress("ship to 123 Main, SF", { llmClient: client })).toBeNull();
  });

  it("returns null on non-JSON output (graceful)", async () => {
    const client = llmReturning({});
    (client.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });
    expect(await extractAddress("ship to nowhere", { llmClient: client })).toBeNull();
  });
});

// ── Variant extractor ──────────────────────────────────────────────────────

describe("extractVariant", () => {
  it("returns a normalized variant selection", async () => {
    const client = llmReturning({ options: { size: "M", color: "blue" } });
    const v = await extractVariant("size medium in blue", { llmClient: client });
    expect(v).toEqual({ options: { size: "M", color: "blue" } });
  });

  it("rejects empty options object (schema)", async () => {
    const client = llmReturning({ options: {} });
    expect(await extractVariant("size something", { llmClient: client })).toBeNull();
  });

  it("returns null on no_match refusal", async () => {
    const client = llmReturning({ _no_match: true });
    expect(await extractVariant("size whatever", { llmClient: client })).toBeNull();
  });

  it("skips when the heuristic doesn't fire (no LLM call)", async () => {
    const client = llmReturning({ options: { size: "M" } });
    expect(await extractVariant("hello there", { llmClient: client })).toBeNull();
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ── Orchestrator ────────────────────────────────────────────────────────────

describe("runVoiceAutofill", () => {
  it("address-only path: persists + broadcasts address_autofill", async () => {
    const client = llmReturning({
      addressLine1: "1 Infinite Loop",
      addressLine2: null,
      city: "Cupertino",
      state: "CA",
      postalCode: "95014",
      country: "US",
    });
    // The variant extractor will also get called via Promise.all — but its
    // heuristic won't fire on this transcript, so no second LLM round-trip
    // happens for variant. (The mock returns the same payload regardless;
    // the heuristic in voice-autofill.service guards us.)
    const result = await runVoiceAutofill(
      "ship to 1 Infinite Loop Cupertino CA 95014",
      { sessionId: "s_addr", siteUrl: "https://shop.example", visitorKey: "v1" },
      client,
    );
    expect(result.addressApplied).toBe(true);
    expect(result.variantApplied).toBe(false);
    expect(upsertAddressMock).toHaveBeenCalledTimes(1);
    expect(upsertAddressMock.mock.calls[0]![0]).toMatchObject({
      visitorKey: "v1",
      siteUrl: "https://shop.example",
      city: "Cupertino",
      state: "CA",
      postalCode: "95014",
    });
    const bs = broadcasts.find((b) => b.msg.type === "address_autofill");
    expect(bs).toBeTruthy();
  });

  it("variant-only path: broadcasts variant_select, does NOT persist", async () => {
    // The LLM mock returns the same payload for both extractors. The
    // heuristic guards: only the variant path's keywords match.
    const client = llmReturning({ options: { size: "L" } });
    const result = await runVoiceAutofill(
      "I'll take the large please",
      { sessionId: "s_var", siteUrl: "https://shop.example", visitorKey: "v2" },
      client,
    );
    expect(result.variantApplied).toBe(true);
    expect(result.addressApplied).toBe(false);
    expect(upsertAddressMock).not.toHaveBeenCalled();
    expect(broadcasts.find((b) => b.msg.type === "variant_select")).toBeTruthy();
  });

  it("no-trigger path: zero LLM calls, zero broadcasts, zero writes", async () => {
    const client = llmReturning({ addressLine1: "x" });
    const result = await runVoiceAutofill(
      "what's your return policy",
      { sessionId: "s_none", siteUrl: "https://shop.example", visitorKey: "v3" },
      client,
    );
    expect(result.addressApplied).toBe(false);
    expect(result.variantApplied).toBe(false);
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
    expect(upsertAddressMock).not.toHaveBeenCalled();
  });

  it("feature-flag off → noop result, no LLM calls", async () => {
    process.env.VOICE_AUTOFILL_ENABLED = "false";
    const client = llmReturning({ addressLine1: "x" });
    const result = await runVoiceAutofill(
      "ship to 123 Main St SF CA 94105",
      { sessionId: "s_off", siteUrl: "x", visitorKey: "v" },
      client,
    );
    expect(result).toEqual({ addressApplied: false, variantApplied: false });
    expect((client.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ── Privacy gate ────────────────────────────────────────────────────────────

describe("voice-autofill — privacy: no PII in logger", () => {
  it("address content never leaks into any log call (happy path)", async () => {
    const needle = "555-CONFIDENTIAL-STREET-NEEDLE";
    const client = llmReturning({
      addressLine1: needle,
      addressLine2: null,
      city: "Cupertino",
      state: "CA",
      postalCode: "95014",
      country: "US",
    });
    await runVoiceAutofill(
      `ship to ${needle} Cupertino CA 95014`,
      { sessionId: "s_priv", siteUrl: "https://shop.example", visitorKey: "v_priv" },
      client,
    );
    const flat = JSON.stringify(loggerCalls);
    expect(flat.includes(needle), `Address PII leaked into logger`).toBe(false);
  });

  // Codex Phase 2.8 P1 regression: when the repo rejects with an error whose
  // .message echoes input values (Prisma does this), the error-log path
  // must NOT pass the raw error to the logger.
  it("address persist failure: needle in the rejected error never appears in logs", async () => {
    const needle = "777-REJECTED-PERSIST-NEEDLE-XYZ";
    upsertAddressMock.mockRejectedValueOnce(
      new Error(`Invalid value for addressLine1: "${needle}"`),
    );
    const client = llmReturning({
      addressLine1: needle,
      addressLine2: null,
      city: "Cupertino",
      state: "CA",
      postalCode: "95014",
      country: "US",
    });
    const result = await runVoiceAutofill(
      `ship to ${needle} Cupertino CA 95014`,
      { sessionId: "s_persist_err", siteUrl: "https://shop.example", visitorKey: "v_pe" },
      client,
    );
    // Failure path → addressApplied stays false.
    expect(result.addressApplied).toBe(false);
    // The error was logged…
    const errCall = loggerCalls.find((args) =>
      JSON.stringify(args).includes("address persist failed"),
    );
    expect(errCall).toBeTruthy();
    // …but the needle (which lives in err.message) MUST NOT be in any log arg.
    const flat = JSON.stringify(loggerCalls);
    expect(
      flat.includes(needle),
      `Address PII from rejected error leaked into logger.\nCaptured:\n${flat.slice(0, 600)}`,
    ).toBe(false);
  });
});
