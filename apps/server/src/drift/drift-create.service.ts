// ============================================================================
// Drift create + notify wrapper — Phase 4.2.
//
// Single entry point for production code paths that emit drift alerts:
//   drift-detector.ts, selector-drift.service.ts, shadow-logger.ts.
//
// Owns the "create the row, then fan out notifications" ordering. The
// persistence call is awaited (drift alert MUST land in the DB). The
// notifier is also awaited so callers can log dispatch results, but
// notifier failures NEVER surface — they're swallowed inside the
// notifier itself (see drift-notifier.service.ts).
// ============================================================================

import { DriftAlertRepo } from "@ava/db";
import { notifyDriftAlert } from "./drift-notifier.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "drift-create" });

export interface CreateDriftAlertWithNotifyInput {
  siteUrl: string | null;
  alertType: string;
  severity: string;
  windowType: string;
  metric: string;
  expected: number;
  actual: number;
  message: string;
}

/**
 * Persist a drift alert then dispatch notifications. Returns the persisted
 * row so callers can chain on `.id` (e.g. dashboard broadcasts).
 */
export async function createDriftAlertWithNotify(
  data: CreateDriftAlertWithNotifyInput,
) {
  const alert = (await DriftAlertRepo.createAlert(data)) as unknown as {
    id: string;
    siteUrl: string | null;
    alertType: string;
    severity: string;
    windowType: string;
    metric: string;
    expected: number;
    actual: number;
    message: string;
  };
  try {
    await notifyDriftAlert({
      id: alert.id,
      siteUrl: alert.siteUrl,
      alertType: alert.alertType,
      severity: alert.severity,
      windowType: alert.windowType,
      metric: alert.metric,
      expected: alert.expected,
      actual: alert.actual,
      message: alert.message,
    });
  } catch (err) {
    // Defense-in-depth: notifier already swallows but in case anything
    // escapes (e.g. a programmer error reading env), don't break callers.
    log.error(
      { alertId: alert.id, err: err instanceof Error ? err.message : String(err) },
      "[drift-create] notify wrapper caught unexpected error — alert is persisted",
    );
  }
  return alert;
}
