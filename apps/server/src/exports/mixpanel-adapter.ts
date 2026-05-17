// ============================================================================
// Mixpanel adapter — Phase 4.4.
//
// POSTs to https://{region}.mixpanel.com/track with the verbose flag so the
// adapter can detect failures the HTTP layer might mask (Codex P1: Mixpanel
// returns 200 with `{ status: 0, error: "..." }` on validation errors).
//
// Env contract:
//   MIXPANEL_PROJECT_TOKEN=...   (project token — required for live route)
//   MIXPANEL_REGION=us|eu|in     (default us)
//   MIXPANEL_VERBOSE=false       (optional — disable verbose if needed; on by default)
//
// When token unset, falls back to the `console` provider which logs and
// returns success. Mirrors the Phase 3.7/4.3 adapter contract.
//
// No npm deps; fetch-only.
// Docs: https://developer.mixpanel.com/reference/track-event
// ============================================================================

import { logger } from "../logger.js";
import type { MixpanelEvent } from "./mixpanel-event-mapper.js";

const log = logger.child({ service: "mixpanel-adapter" });

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface MixpanelPayload {
  events: MixpanelEvent[];
}

export interface MixpanelResult {
  provider: "console" | "mixpanel";
  endpoint: string;
  eventCount: number;
  /** When verbose=true, Mixpanel's JSON status (1 = success, 0 = failure). */
  status?: number;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

// ---------------------------------------------------------------------------
// Console adapter — dev/CI safe, never sends.
// ---------------------------------------------------------------------------

export async function sendViaConsole(payload: MixpanelPayload): Promise<MixpanelResult> {
  log.info(
    { eventCount: payload.events.length, names: payload.events.map((e) => e.event) },
    "[mixpanel-adapter:console] Payload captured (not sent)",
  );
  return { provider: "console", endpoint: "console", eventCount: payload.events.length };
}

// ---------------------------------------------------------------------------
// Mixpanel /track adapter
// ---------------------------------------------------------------------------

const HOST_FOR_REGION: Record<string, string> = {
  us: "api.mixpanel.com",
  eu: "api-eu.mixpanel.com",
  in: "api-in.mixpanel.com",
};

export interface MixpanelOptions {
  region?: string;
  /** Use the /track verbose response. Default true — Codex-mandated. */
  verbose?: boolean;
  fetchImpl?: FetchLike;
}

export async function sendViaMixpanel(payload: MixpanelPayload, opts: MixpanelOptions): Promise<MixpanelResult> {
  const host = HOST_FOR_REGION[opts.region ?? "us"] ?? HOST_FOR_REGION.us;
  const verbose = opts.verbose !== false; // default true
  const endpoint = `https://${host}/track${verbose ? "?verbose=1" : ""}`;
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload.events),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mixpanel send failed: ${res.status} ${detail}`.trim());
  }

  // Codex P1: even on HTTP 200, Mixpanel can return `{ status: 0, error }`
  // for validation failures. Inspect the verbose body and throw on status:0.
  let status: number | undefined;
  if (verbose) {
    try {
      const json = (await res.json()) as { status?: number; error?: string };
      status = json.status;
      if (json.status === 0) {
        throw new Error(`Mixpanel validation rejected: ${json.error ?? "unknown error"}`);
      }
    } catch (err) {
      // If JSON parse fails AFTER an OK HTTP status, treat as success but
      // log — production Mixpanel always returns valid JSON on verbose=1.
      // Re-throw if this is OUR validation error from the line above.
      if (err instanceof Error && err.message.startsWith("Mixpanel validation rejected")) {
        throw err;
      }
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "[mixpanel-adapter] verbose body parse failed");
    }
  }

  log.info({ endpoint, eventCount: payload.events.length, status }, "[mixpanel-adapter:mixpanel] Payload sent");
  return { provider: "mixpanel", endpoint, eventCount: payload.events.length, status };
}

// ---------------------------------------------------------------------------
// Dispatcher — env-driven
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  provider?: "console" | "mixpanel";
  fetchImpl?: FetchLike;
}

export async function sendMixpanelPayload(payload: MixpanelPayload, opts: DispatchOptions = {}): Promise<MixpanelResult> {
  const token = process.env.MIXPANEL_PROJECT_TOKEN ?? "";
  const region = process.env.MIXPANEL_REGION ?? "us";
  const verbose = process.env.MIXPANEL_VERBOSE !== "false";

  const provider = opts.provider ?? (token ? "mixpanel" : "console");
  if (provider === "mixpanel") {
    if (!token) throw new Error("MIXPANEL_PROJECT_TOKEN is required for mixpanel provider");
    return sendViaMixpanel(payload, { region, verbose, fetchImpl: opts.fetchImpl });
  }
  return sendViaConsole(payload);
}
