// ============================================================================
// observer-registry — verifies the registry covers the expected set and
// that startAllObservers is fault-tolerant.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  REGISTERED_OBSERVER_COUNT,
  REGISTERED_OBSERVER_CLASS_NAMES,
  LEGACY_OBSERVER_CLASS_NAMES,
  startAllObservers,
} from "./observer-registry.js";

// Minimal stub for the FISMBridge — the registry only forwards it.
const fakeBridge = {
  send: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
} as unknown as Parameters<typeof startAllObservers>[0];

describe("observer registry", () => {
  it("covers exactly the 9 Thinking-Layer observers (no legacy)", () => {
    // The registry's job is the Thinking Layer signal set (F326-F335 +
    // element re-read). Legacy events come from BehaviorCollector — if
    // they're added here the widget will double-emit.
    expect(REGISTERED_OBSERVER_COUNT).toBe(9);
  });

  it("does NOT include any class BehaviorCollector already covers", () => {
    // Duplicate-emit guard (Codex 2026-05-19 follow-up). If a future
    // change wires a legacy observer here without first disabling the
    // overlapping BehaviorCollector listener, this test fails.
    for (const legacy of LEGACY_OBSERVER_CLASS_NAMES) {
      expect(
        REGISTERED_OBSERVER_CLASS_NAMES,
        `${legacy} is in the registry — duplicates BehaviorCollector emissions`,
      ).not.toContain(legacy);
    }
  });

  it("includes the expected Thinking-Layer class names", () => {
    const expected = [
      "CheckoutStepObserver",
      "CrossProductCompareObserver",
      "ElementRereadObserver",
      "LandingGreetObserver",
      "OosVariantObserver",
      "ReturningVisitorObserver",
      "ReviewDepthObserver",
      "SizeChartObserver",
      "VariantFrequencyObserver",
    ];
    expect([...REGISTERED_OBSERVER_CLASS_NAMES].sort()).toEqual(
      expected.sort(),
    );
  });

  it("startAllObservers returns a teardown function", () => {
    // jsdom-less env — observers may throw on DOM access; we don't care.
    // We only assert the boot path returns a callable.
    const stop = startAllObservers(fakeBridge);
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });
});
