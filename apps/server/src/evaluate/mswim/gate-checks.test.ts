// ============================================================================
// Gate Check Tests — all 12 gates
// ============================================================================
import { describe, it, expect } from "vitest";
import { runGateChecks, type GateContext } from "./gate-checks.js";
import { DEFAULT_GATES } from "@ava/shared";
import { GateOverride, ScoreTier } from "@ava/shared";

/** Baseline context — all gates should pass (null result). */
const cleanCtx: GateContext = {
  sessionAgeSec: 60,
  totalInterventionsFired: 0,
  totalDismissals: 0,
  totalNudges: 0,
  totalActive: 0,
  totalNonPassive: 0,
  secondsSinceLastIntervention: null,
  secondsSinceLastActive: null,
  secondsSinceLastNudge: null,
  secondsSinceLastDismissal: null,
  frictionIdsAlreadyIntervened: [],
  currentFrictionIds: [],
  hasTechnicalError: false,
  hasOutOfStock: false,
  hasShippingIssue: false,
  hasPaymentFailure: false,
  hasCheckoutTimeout: false,
  hasHelpSearch: false,
};

describe("runGateChecks — clean session", () => {
  it("returns null override for a clean NUDGE session", () => {
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, cleanCtx);
    expect(result.override).toBeNull();
    expect(result.action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SUPPRESS GATES
// ---------------------------------------------------------------------------
describe("Gate 1 — SESSION_TOO_YOUNG", () => {
  it("suppresses when sessionAgeSec < minSessionAgeSec and tier is not ESCALATE", () => {
    const ctx = { ...cleanCtx, sessionAgeSec: 10 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.SESSION_TOO_YOUNG);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress ESCALATE regardless of session age", () => {
    const ctx = { ...cleanCtx, sessionAgeSec: 0 };
    const result = runGateChecks(ScoreTier.ESCALATE, DEFAULT_GATES, ctx);
    expect(result.override).not.toBe(GateOverride.SESSION_TOO_YOUNG);
  });
});

describe("Gate 2 — DISMISS_CAP", () => {
  it("suppresses when dismissals >= dismissalsToSuppress (3)", () => {
    const ctx = { ...cleanCtx, totalDismissals: 3 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.DISMISS_CAP);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress at 2 dismissals", () => {
    const ctx = { ...cleanCtx, totalDismissals: 2 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).not.toBe(GateOverride.DISMISS_CAP);
  });
});

describe("Gate 3 — DUPLICATE_FRICTION", () => {
  it("suppresses when current friction was already intervened (non-ESCALATE)", () => {
    const ctx = {
      ...cleanCtx,
      currentFrictionIds: ["F001"],
      frictionIdsAlreadyIntervened: ["F001"],
    };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.DUPLICATE_FRICTION);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress ESCALATE on duplicate friction", () => {
    const ctx = {
      ...cleanCtx,
      currentFrictionIds: ["F001"],
      frictionIdsAlreadyIntervened: ["F001"],
    };
    const result = runGateChecks(ScoreTier.ESCALATE, DEFAULT_GATES, ctx);
    expect(result.override).not.toBe(GateOverride.DUPLICATE_FRICTION);
  });
});

describe("Gate 3b — PASSIVE_COOLDOWN (30s)", () => {
  it("suppresses PASSIVE within 30s of last intervention", () => {
    const ctx = { ...cleanCtx, secondsSinceLastIntervention: 15 };
    const result = runGateChecks(ScoreTier.PASSIVE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.COOLDOWN_ACTIVE);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress NUDGE via passive cooldown", () => {
    const ctx = { ...cleanCtx, secondsSinceLastIntervention: 15 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    // NUDGE is > PASSIVE, passive cooldown gate won't fire for it
    expect(result.action).not.toBe("suppress");
  });
});

describe("Gate 4 — COOLDOWN_ACTIVE (120s after ACTIVE)", () => {
  it("suppresses when secondsSinceLastActive < cooldownAfterActiveSec and tier < ESCALATE", () => {
    const ctx = { ...cleanCtx, secondsSinceLastActive: 60 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.COOLDOWN_ACTIVE);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress ESCALATE during active cooldown", () => {
    const ctx = { ...cleanCtx, secondsSinceLastActive: 60 };
    const result = runGateChecks(ScoreTier.ESCALATE, DEFAULT_GATES, ctx);
    expect(result.override).not.toBe(GateOverride.COOLDOWN_ACTIVE);
  });

  it("does NOT suppress after cooldown has elapsed", () => {
    const ctx = { ...cleanCtx, secondsSinceLastActive: 121 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.action).toBeNull();
  });
});

describe("Gate 5 — COOLDOWN_NUDGE (60s after NUDGE)", () => {
  it("suppresses NUDGE within 60s of last nudge", () => {
    const ctx = { ...cleanCtx, secondsSinceLastNudge: 30 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.COOLDOWN_ACTIVE);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress ACTIVE via nudge cooldown", () => {
    const ctx = { ...cleanCtx, secondsSinceLastNudge: 30 };
    const result = runGateChecks(ScoreTier.ACTIVE, DEFAULT_GATES, ctx);
    expect(result.action).toBeNull();
  });
});

describe("Gate 6 — SESSION_CAP", () => {
  it("suppresses ACTIVE when totalActive >= maxActivePerSession (2)", () => {
    const ctx = { ...cleanCtx, totalActive: 2 };
    const result = runGateChecks(ScoreTier.ACTIVE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.SESSION_CAP);
    expect(result.action).toBe("suppress");
  });

  it("suppresses NUDGE when totalNudges >= maxNudgePerSession (3)", () => {
    const ctx = { ...cleanCtx, totalNudges: 3 };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.SESSION_CAP);
    expect(result.action).toBe("suppress");
  });

  it("suppresses ACTIVE when totalNonPassive >= maxNonPassivePerSession (6)", () => {
    const ctx = { ...cleanCtx, totalNonPassive: 6 };
    const result = runGateChecks(ScoreTier.ACTIVE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.SESSION_CAP);
    expect(result.action).toBe("suppress");
  });

  it("does NOT suppress PASSIVE/MONITOR via nonPassive cap", () => {
    const ctx = { ...cleanCtx, totalNonPassive: 10 };
    const passiveResult = runGateChecks(ScoreTier.PASSIVE, DEFAULT_GATES, ctx);
    expect(passiveResult.action).toBeNull();
    const monitorResult = runGateChecks(ScoreTier.MONITOR, DEFAULT_GATES, ctx);
    expect(monitorResult.action).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FORCE-PASSIVE GATES
// ---------------------------------------------------------------------------
describe("Force-passive gates", () => {
  it("FORCE_PASSIVE_TECHNICAL when hasTechnicalError and tier > PASSIVE", () => {
    const ctx = { ...cleanCtx, hasTechnicalError: true };
    const result = runGateChecks(ScoreTier.ACTIVE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_PASSIVE_TECHNICAL);
    expect(result.action).toBe("force_passive");
  });

  it("does NOT force-passive when tier is already PASSIVE", () => {
    const ctx = { ...cleanCtx, hasTechnicalError: true };
    const result = runGateChecks(ScoreTier.PASSIVE, DEFAULT_GATES, ctx);
    expect(result.action).toBeNull();
  });

  it("FORCE_PASSIVE_OOS when hasOutOfStock and tier > PASSIVE", () => {
    const ctx = { ...cleanCtx, hasOutOfStock: true };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_PASSIVE_OOS);
    expect(result.action).toBe("force_passive");
  });

  it("FORCE_PASSIVE_SHIPPING when hasShippingIssue and tier > PASSIVE", () => {
    const ctx = { ...cleanCtx, hasShippingIssue: true };
    const result = runGateChecks(ScoreTier.ESCALATE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_PASSIVE_SHIPPING);
    expect(result.action).toBe("force_passive");
  });
});

// ---------------------------------------------------------------------------
// FORCE-ESCALATE GATES
// ---------------------------------------------------------------------------
describe("Force-escalate gates", () => {
  it("FORCE_ESCALATE_PAYMENT on payment failure (any tier)", () => {
    const ctx = { ...cleanCtx, hasPaymentFailure: true };
    const result = runGateChecks(ScoreTier.MONITOR, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_ESCALATE_PAYMENT);
    expect(result.action).toBe("force_escalate");
  });

  it("FORCE_ESCALATE_CHECKOUT_TIMEOUT on checkout timeout", () => {
    const ctx = { ...cleanCtx, hasCheckoutTimeout: true };
    const result = runGateChecks(ScoreTier.PASSIVE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_ESCALATE_CHECKOUT_TIMEOUT);
    expect(result.action).toBe("force_escalate");
  });

  it("FORCE_ESCALATE_HELP_SEARCH on help search", () => {
    const ctx = { ...cleanCtx, hasHelpSearch: true };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.FORCE_ESCALATE_HELP_SEARCH);
    expect(result.action).toBe("force_escalate");
  });
});

// ---------------------------------------------------------------------------
// Priority order — suppress takes precedence over force gates when earlier
// ---------------------------------------------------------------------------
describe("Gate priority", () => {
  it("suppress fires before force-passive when session is too young", () => {
    // SESSION_TOO_YOUNG (gate 1) fires before FORCE_PASSIVE (later gates)
    const ctx = {
      ...cleanCtx,
      sessionAgeSec: 5,
      hasTechnicalError: true,
    };
    const result = runGateChecks(ScoreTier.NUDGE, DEFAULT_GATES, ctx);
    expect(result.override).toBe(GateOverride.SESSION_TOO_YOUNG);
  });
});
