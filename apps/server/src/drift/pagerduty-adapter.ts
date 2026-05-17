// ============================================================================
// PagerDuty adapter — Phase 4.2.
//
// Mirrors the Phase 3.7 email-adapter contract. Pluggable via env:
//
//   PAGERDUTY_ROUTING_KEY=...  → routes through Events API v2
//   (unset)                    → console fallback (logs, never pages)
//
// Events API v2 docs: https://developer.pagerduty.com/docs/events-api-v2/
// Endpoint: POST https://events.pagerduty.com/v2/enqueue
// Auth: routing_key in body (NOT a header). Same key per service.
//
// Severity mapping (PagerDuty enum: info | warning | error | critical):
//   AVA warning  → PagerDuty "warning"
//   AVA critical → PagerDuty "critical"
// ============================================================================

import { logger } from "../logger.js";

const log = logger.child({ service: "pagerduty-adapter" });

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface PagerDutyEvent {
  /** Unique key for deduplication on PagerDuty's side. We use the AVA alert id. */
  dedupKey: string;
  /** Short summary shown in the incident header. */
  summary: string;
  /** PagerDuty severity. Maps from AVA's `warning | critical`. */
  severity: "info" | "warning" | "error" | "critical";
  /** Where the alert originated. Shows up in the incident UI. */
  source: string;
  /** Optional metadata payload — surfaced under "Custom Details". */
  customDetails?: Record<string, unknown>;
}

export interface PagerDutyResult {
  provider: "console" | "pagerduty";
  dedupKey: string;
  messageId?: string;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

// ---------------------------------------------------------------------------
// Console adapter — never pages, useful for dev/CI.
// ---------------------------------------------------------------------------

export async function sendViaConsole(event: PagerDutyEvent): Promise<PagerDutyResult> {
  log.info(
    { dedupKey: event.dedupKey, severity: event.severity, summary: event.summary, source: event.source },
    "[pagerduty-adapter:console] PagerDuty event captured (not sent)",
  );
  return { provider: "console", dedupKey: event.dedupKey, messageId: `console_${Date.now()}` };
}

// ---------------------------------------------------------------------------
// Events API v2
// ---------------------------------------------------------------------------

export interface PagerDutyOptions {
  routingKey: string;
  fetchImpl?: FetchLike;
}

export async function sendViaPagerDuty(event: PagerDutyEvent, opts: PagerDutyOptions): Promise<PagerDutyResult> {
  if (!opts.routingKey) throw new Error("PAGERDUTY_ROUTING_KEY is required for pagerduty provider");
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));

  const body = {
    routing_key: opts.routingKey,
    event_action: "trigger",
    dedup_key: event.dedupKey,
    payload: {
      summary: event.summary,
      severity: event.severity,
      source: event.source,
      custom_details: event.customDetails ?? {},
    },
  };

  const res = await fetchImpl("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PagerDuty enqueue failed: ${res.status} ${detail}`.trim());
  }
  const json = (await res.json()) as { dedup_key?: string; message?: string };
  log.info(
    { dedupKey: event.dedupKey, severity: event.severity, response: json.message },
    "[pagerduty-adapter:pagerduty] Event enqueued",
  );
  return { provider: "pagerduty", dedupKey: event.dedupKey, messageId: json.dedup_key ?? event.dedupKey };
}

// ---------------------------------------------------------------------------
// Dispatcher — env-driven, no top-level reads (tests can override per-test).
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  provider?: "console" | "pagerduty";
  fetchImpl?: FetchLike;
}

export async function sendPagerDutyEvent(event: PagerDutyEvent, opts: DispatchOptions = {}): Promise<PagerDutyResult> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY ?? "";
  const provider = opts.provider ?? (routingKey ? "pagerduty" : "console");
  if (provider === "pagerduty") {
    return sendViaPagerDuty(event, { routingKey, fetchImpl: opts.fetchImpl });
  }
  return sendViaConsole(event);
}
