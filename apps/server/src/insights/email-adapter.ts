// ============================================================================
// Email adapter — Phase 3.7.
//
// Pluggable transport for transactional email. Chosen via EMAIL_PROVIDER env:
//
//   console (default) — logs the rendered email; safe for dev/CI. NEVER sends.
//   resend            — Resend HTTP API via fetch. No npm dep.
//                       Requires: RESEND_API_KEY, EMAIL_FROM
//
// `sendEmail` is the common contract every adapter implements. The result
// shape exposes `provider` so callers can persist the delivery channel and
// `messageId` when the provider returns one (Resend does; the console
// adapter synthesizes a stable-ish dev id).
// ============================================================================

import { logger } from "../logger.js";

const log = logger.child({ service: "email-adapter" });

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendEmailResult {
  provider: "console" | "resend";
  recipient: string;
  subject: string;
  messageId?: string;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

// ---------------------------------------------------------------------------
// Console adapter — default for dev/CI, never sends a real email.
// ---------------------------------------------------------------------------

export async function sendViaConsole(input: SendEmailInput): Promise<SendEmailResult> {
  log.info(
    { to: input.to, subject: input.subject, htmlBytes: input.html.length, textBytes: input.text.length },
    "[email-adapter:console] Email captured (not sent)",
  );
  return {
    provider: "console",
    recipient: input.to,
    subject: input.subject,
    messageId: `console_${Date.now()}`,
  };
}

// ---------------------------------------------------------------------------
// Resend adapter — POST https://api.resend.com/emails
// ---------------------------------------------------------------------------

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetchImpl?: FetchLike;
}

export async function sendViaResend(input: SendEmailInput, opts: ResendOptions): Promise<SendEmailResult> {
  if (!opts.apiKey) throw new Error("RESEND_API_KEY is required for resend provider");
  if (!opts.from && !input.from) throw new Error("EMAIL_FROM is required for resend provider");
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));

  const body = {
    from: input.from ?? opts.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${detail}`.trim());
  }
  const json = (await res.json()) as { id?: string };
  log.info({ to: input.to, subject: input.subject, messageId: json.id }, "[email-adapter:resend] Email sent");
  return {
    provider: "resend",
    recipient: input.to,
    subject: input.subject,
    messageId: json.id,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher — chooses adapter from env at call time (no top-level reads so
// tests can override env per-test without module-cache pinning).
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  /** Force a specific provider (overrides env). */
  provider?: "console" | "resend";
  /** Optional fetch override for the resend adapter (tests inject this). */
  fetchImpl?: FetchLike;
}

export async function sendEmail(input: SendEmailInput, opts: DispatchOptions = {}): Promise<SendEmailResult> {
  const provider = opts.provider ?? (process.env.EMAIL_PROVIDER as "console" | "resend" | undefined) ?? "console";
  if (provider === "resend") {
    return sendViaResend(input, {
      apiKey: process.env.RESEND_API_KEY ?? "",
      from: process.env.EMAIL_FROM ?? "",
      fetchImpl: opts.fetchImpl,
    });
  }
  return sendViaConsole(input);
}
