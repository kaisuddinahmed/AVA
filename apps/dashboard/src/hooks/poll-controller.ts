// ============================================================================
// poll-controller — Phase 3.5.
//
// Tiny dependency-injected polling loop with tab-visibility awareness.
// All side effects (timers, document visibility) are passed in via `env`
// so the controller is unit-testable in plain node — no jsdom required.
//
// Lifecycle:
//   start()  → arms the interval (if pollMs > 0) and subscribes to
//              visibility changes. If the doc starts hidden, no timer is
//              scheduled until it becomes visible.
//   stop()   → clears the interval and unsubscribes.
//
// On visibility transitions:
//   hidden → visible : onTick fires immediately, then the interval resumes.
//   visible → hidden : the interval is paused.
// ============================================================================

export interface PollControllerEnv {
  isHidden: () => boolean;
  addVisibilityListener: (fn: () => void) => void;
  removeVisibilityListener: (fn: () => void) => void;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

export interface PollControllerOptions {
  /** Poll interval in ms. 0 / negative / undefined disables interval polling. */
  pollMs: number;
  /** Fires once per tick (interval or visibility-resume). */
  onTick: () => void;
  env: PollControllerEnv;
}

export interface PollController {
  start: () => void;
  stop: () => void;
}

export function createPollController(opts: PollControllerOptions): PollController {
  const { pollMs, onTick, env } = opts;
  let timerId: number | null = null;
  let started = false;

  const armTimer = () => {
    if (timerId !== null || !(pollMs > 0)) return;
    timerId = env.setInterval(onTick, pollMs);
  };
  const disarmTimer = () => {
    if (timerId === null) return;
    env.clearInterval(timerId);
    timerId = null;
  };

  const onVisibilityChange = () => {
    if (!started) return;
    if (env.isHidden()) {
      disarmTimer();
    } else {
      // Tab just came back — refresh immediately, then resume the loop.
      onTick();
      armTimer();
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      env.addVisibilityListener(onVisibilityChange);
      // Don't arm a timer while hidden — wait for visibilitychange.
      if (!env.isHidden()) armTimer();
    },
    stop() {
      if (!started) return;
      started = false;
      env.removeVisibilityListener(onVisibilityChange);
      disarmTimer();
    },
  };
}
