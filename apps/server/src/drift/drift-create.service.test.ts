// ============================================================================
// drift-create.service — Phase 4.2 wrapper unit tests.
//
// Asserts:
//   - persists the alert exactly once via DriftAlertRepo.createAlert
//   - calls notifyDriftAlert exactly once with the persisted row's fields
//   - notifier failure does NOT propagate (alert is the system of record)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const createAlert = vi.fn();
const notifyDriftAlert = vi.fn();

vi.mock("@ava/db", () => ({
  DriftAlertRepo: {
    createAlert: (...args: unknown[]) => createAlert(...args),
  },
}));
vi.mock("./drift-notifier.service.js", () => ({
  notifyDriftAlert: (...args: unknown[]) => notifyDriftAlert(...args),
}));

import { createDriftAlertWithNotify } from "./drift-create.service.js";

beforeEach(() => {
  createAlert.mockReset().mockImplementation(async (data: object) => ({ id: "alert_1", ...data }));
  notifyDriftAlert.mockReset().mockResolvedValue({
    email: { sent: true },
    pagerduty: { sent: false, skipped: true },
  });
});

const INPUT = {
  siteUrl: "https://shop.example",
  alertType: "tier_agreement_drop",
  severity: "critical",
  windowType: "1h",
  metric: "tierAgreementRate",
  expected: 0.85,
  actual: 0.65,
  message: "Tier agreement dropped",
};

describe("createDriftAlertWithNotify", () => {
  it("persists once and notifies once", async () => {
    const alert = await createDriftAlertWithNotify(INPUT);
    expect(createAlert).toHaveBeenCalledTimes(1);
    expect(notifyDriftAlert).toHaveBeenCalledTimes(1);
    expect(alert.id).toBe("alert_1");
  });

  it("forwards persisted row fields to the notifier (including the new id)", async () => {
    await createDriftAlertWithNotify(INPUT);
    const notified = notifyDriftAlert.mock.calls[0]![0] as Record<string, unknown>;
    expect(notified.id).toBe("alert_1");
    expect(notified.alertType).toBe("tier_agreement_drop");
    expect(notified.severity).toBe("critical");
    expect(notified.actual).toBe(0.65);
  });

  it("returns the persisted alert even when the notifier throws", async () => {
    notifyDriftAlert.mockRejectedValue(new Error("unexpected"));
    const alert = await createDriftAlertWithNotify(INPUT);
    expect(alert.id).toBe("alert_1");
    expect(createAlert).toHaveBeenCalled();
  });
});
