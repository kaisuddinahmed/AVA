// ============================================================================
// poll-controller — Phase 3.5 unit tests.
//
// Pure-node tests with a stub env. Asserts:
//   - interval arms on start when visible, fires onTick every pollMs
//   - timer is paused when document becomes hidden
//   - timer resumes + onTick fires immediately when visible again
//   - stop() unsubscribes and clears the timer
//   - pollMs<=0 disables interval but visibility-resume still fires onTick
//   - starting while hidden defers timer until visible
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPollController, type PollControllerEnv } from "./poll-controller";

function makeEnv(initialHidden = false) {
  let hidden = initialHidden;
  const listeners = new Set<() => void>();
  let nextId = 1;
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  const env: PollControllerEnv = {
    isHidden: () => hidden,
    addVisibilityListener: (fn) => { listeners.add(fn); },
    removeVisibilityListener: (fn) => { listeners.delete(fn); },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { intervals.delete(id); },
  };
  return {
    env,
    listeners,
    intervals,
    setHidden(v: boolean) {
      hidden = v;
      for (const l of [...listeners]) l();
    },
    tick(id: number) { intervals.get(id)?.fn(); },
    activeIntervals: () => intervals.size,
  };
}

describe("createPollController", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("arms an interval on start when visible and fires onTick on each tick", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });

    c.start();
    expect(h.activeIntervals()).toBe(1);
    const id = [...h.intervals.keys()][0]!;
    h.tick(id);
    h.tick(id);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("does NOT call onTick on start (the React effect owns the initial load)", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    expect(onTick).not.toHaveBeenCalled();
  });

  it("pauses the timer when the doc becomes hidden", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    expect(h.activeIntervals()).toBe(1);
    h.setHidden(true);
    expect(h.activeIntervals()).toBe(0);
  });

  it("on visible-resume: fires onTick immediately AND re-arms the timer", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    h.setHidden(true);
    expect(onTick).not.toHaveBeenCalled();
    h.setHidden(false);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(h.activeIntervals()).toBe(1);
  });

  it("starting while hidden defers the timer until visible", () => {
    const onTick = vi.fn();
    const h = makeEnv(true /* initial hidden */);
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    expect(h.activeIntervals()).toBe(0);
    h.setHidden(false);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(h.activeIntervals()).toBe(1);
  });

  it("stop() clears the timer and unsubscribes visibility", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    expect(h.listeners.size).toBe(1);
    c.stop();
    expect(h.listeners.size).toBe(0);
    expect(h.activeIntervals()).toBe(0);
    // After stop, visibility transitions are no-ops.
    h.setHidden(false);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("pollMs<=0 disables interval polling but still fires on visibility-resume", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 0, onTick, env: h.env });
    c.start();
    expect(h.activeIntervals()).toBe(0);
    h.setHidden(true);
    h.setHidden(false);
    expect(onTick).toHaveBeenCalledTimes(1);
    // No interval re-armed either.
    expect(h.activeIntervals()).toBe(0);
  });

  it("start() is idempotent — second call does not double-arm", () => {
    const onTick = vi.fn();
    const h = makeEnv();
    const c = createPollController({ pollMs: 1000, onTick, env: h.env });
    c.start();
    c.start();
    expect(h.activeIntervals()).toBe(1);
    expect(h.listeners.size).toBe(1);
  });
});
