// ============================================================================
// Digest email service — Phase 3.7.
//
// Glue between the Phase 3.6 digest composer, the email renderer, and the
// transport adapter. Owns:
//   - recipient resolution (explicit override > env > error)
//   - dispatch ordering (build → render → send)
//   - returning a normalized result for the API + scheduler
// ============================================================================

import { buildWeeklyDigest, type BuildDigestOptions, type WeeklyDigest } from "./weekly-digest.service.js";
import { renderDigestEmail, type RenderedEmail } from "./digest-email.renderer.js";
import { sendEmail, type DispatchOptions, type SendEmailResult } from "./email-adapter.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "digest-email.service" });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SendDigestOptions extends BuildDigestOptions, DispatchOptions {
  /** Explicit recipient override (e.g. merchant manually entered). */
  recipient?: string;
}

export interface SendDigestResult {
  digest: WeeklyDigest;
  rendered: RenderedEmail;
  delivery: SendEmailResult;
}

/** Resolution order for recipient: explicit > DIGEST_EMAIL_RECIPIENT env. */
function resolveRecipient(explicit: string | undefined): string {
  const recipient = (explicit ?? process.env.DIGEST_EMAIL_RECIPIENT ?? "").trim();
  if (!recipient) {
    throw new Error(
      "No digest recipient configured. Pass `recipient` or set DIGEST_EMAIL_RECIPIENT.",
    );
  }
  return recipient;
}

/**
 * Build, render, and deliver the weekly digest email for a site.
 *
 *   sendDigestEmail("https://shop.example", { recipient: "owner@shop.com" })
 *
 * Returns the digest data, the rendered email, and the transport result —
 * callers can persist whichever fields matter to them.
 */
export async function sendDigestEmail(
  siteUrl: string,
  opts: SendDigestOptions = {},
): Promise<SendDigestResult> {
  const recipient = resolveRecipient(opts.recipient);
  const digest = await buildWeeklyDigest(siteUrl, {
    windowDays: opts.windowDays,
    now: opts.now,
    topFrictionsLimit: opts.topFrictionsLimit,
  });
  const rendered = renderDigestEmail(digest);
  const delivery = await sendEmail(
    { to: recipient, subject: rendered.subject, html: rendered.html, text: rendered.text },
    { provider: opts.provider, fetchImpl: opts.fetchImpl },
  );
  log.info(
    {
      siteUrl,
      recipient,
      provider: delivery.provider,
      messageId: delivery.messageId,
      attributedRevenue: digest.outcomes.attributedRevenue,
      pending: digest.recommendations.pendingNow,
    },
    "[Digest email] sent",
  );
  return { digest, rendered, delivery };
}
