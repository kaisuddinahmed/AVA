// ============================================================================
// GA4 adapter — Phase 4.3.
//
// POSTs Measurement Protocol events to Google Analytics 4. Pluggable via env:
//
//   GA4_MEASUREMENT_ID=G-XXXXXXX   (web stream measurement id)
//   GA4_API_SECRET=...             (per data-stream API secret)
//   GA4_REGION=eu                  (optional — routes to region1.* host)
//   GA4_DEBUG=true                 (optional — routes to /debug/mp/collect
//                                   which validates but does NOT record)
//
// When measurement_id OR api_secret is unset, falls back to the `console`
// provider which logs and returns success — safe in dev/CI.
//
// No npm deps; fetch-only. Codex-validated against the live docs
// (last updated 2025-12-11):
// https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
// ============================================================================

import { logger } from "../logger.js";
import type { GA4Event } from "./ga4-event-mapper.js";

const log = logger.child({ service: "ga4-adapter" });

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface GA4Payload {
  clientId: string;
  events: GA4Event[];
}

export interface GA4Result {
  provider: "console" | "ga4";
  endpoint: string;
  eventCount: number;
  validationMessages?: unknown;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

// ---------------------------------------------------------------------------
// Console adapter — for dev/CI, never sends.
// ---------------------------------------------------------------------------

export async function sendViaConsole(payload: GA4Payload): Promise<GA4Result> {
  log.info(
    { clientId: payload.clientId, eventCount: payload.events.length, names: payload.events.map((e) => e.name) },
    "[ga4-adapter:console] Payload captured (not sent)",
  );
  return { provider: "console", endpoint: "console", eventCount: payload.events.length };
}

// ---------------------------------------------------------------------------
// GA4 Measurement Protocol adapter
// ---------------------------------------------------------------------------

export interface GA4AdapterOptions {
  measurementId: string;
  apiSecret: string;
  /** "eu" routes to region1.google-analytics.com; anything else uses default. */
  region?: string;
  /** When true, routes to /debug/mp/collect (validates only, no record). */
  debug?: boolean;
  fetchImpl?: FetchLike;
}

export async function sendViaGA4(payload: GA4Payload, opts: GA4AdapterOptions): Promise<GA4Result> {
  if (!opts.measurementId) throw new Error("GA4_MEASUREMENT_ID is required for ga4 provider");
  if (!opts.apiSecret)     throw new Error("GA4_API_SECRET is required for ga4 provider");

  const host = opts.region === "eu" ? "region1.google-analytics.com" : "www.google-analytics.com";
  const path = opts.debug ? "/debug/mp/collect" : "/mp/collect";
  const endpoint = `https://${host}${path}?measurement_id=${encodeURIComponent(opts.measurementId)}&api_secret=${encodeURIComponent(opts.apiSecret)}`;

  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const body = JSON.stringify({
    client_id: payload.clientId,
    events: payload.events,
  });

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GA4 send failed: ${res.status} ${detail}`.trim());
  }

  // /mp/collect returns 204 No Content with empty body on success.
  // /debug/mp/collect returns 200 with validationMessages array.
  let validationMessages: unknown;
  if (opts.debug) {
    try {
      const json = (await res.json()) as { validationMessages?: unknown };
      validationMessages = json.validationMessages;
    } catch {
      // ignore — debug endpoint occasionally returns empty body
    }
  }

  log.info(
    { endpoint: `${host}${path}`, eventCount: payload.events.length, debug: !!opts.debug },
    "[ga4-adapter:ga4] Payload sent",
  );
  return { provider: "ga4", endpoint, eventCount: payload.events.length, validationMessages };
}

// ---------------------------------------------------------------------------
// Dispatcher — env-driven
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  /** Force a specific provider (overrides env-based routing). */
  provider?: "console" | "ga4";
  fetchImpl?: FetchLike;
}

export async function sendGA4Payload(payload: GA4Payload, opts: DispatchOptions = {}): Promise<GA4Result> {
  const measurementId = process.env.GA4_MEASUREMENT_ID ?? "";
  const apiSecret = process.env.GA4_API_SECRET ?? "";
  const region = process.env.GA4_REGION ?? "";
  const debug = process.env.GA4_DEBUG === "true";

  const provider = opts.provider ?? (measurementId && apiSecret ? "ga4" : "console");
  if (provider === "ga4") {
    return sendViaGA4(payload, { measurementId, apiSecret, region, debug, fetchImpl: opts.fetchImpl });
  }
  return sendViaConsole(payload);
}
