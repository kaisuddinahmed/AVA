// ============================================================================
// Webhook Service — session-exit behavioral trigger
//
// Fires when a session ends without conversion and the site has a webhookUrl
// configured. Payload signed with HMAC-SHA256. Up to 3 retries with
// exponential backoff.
// ============================================================================

import { createHmac } from "crypto";
import { WebhookDeliveryRepo, SiteConfigRepo, SessionRepo, EventRepo, EvaluationRepo } from "@ava/db";
import { prisma } from "@ava/db";

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

export interface SessionExitPayload {
  visitorKey: string;
  siteUrl: string;
  sessionId: string;
  exitPage: string | null;
  topFrictionIds: string[];
  cartValue: number;
  productsViewed: string[];       // last 5 product names/IDs
  mswimTierAtExit: string | null;
  abandonmentScore: number | null;
  sessionDurationMs: number;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Emit a session_exit webhook if:
 *   - The session ended without a conversion
 *   - The site has a webhookUrl configured
 */
export async function emitSessionExitWebhook(sessionId: string): Promise<void> {
  const session = await SessionRepo.getSession(sessionId);
  if (!session) return;

  // Skip if session had a conversion
  if (session.totalConversions > 0) return;

  // Get site config
  const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(session.siteUrl).catch(() => null);
  if (!siteConfig?.webhookUrl) return;

  // Build payload
  const payload = await buildPayload(session, sessionId);

  // Record delivery attempt
  const delivery = await WebhookDeliveryRepo.createWebhookDelivery({
    sessionId,
    siteUrl: session.siteUrl,
    url: siteConfig.webhookUrl,
  });

  // Send with retries
  sendWithRetry(delivery.id, siteConfig.webhookUrl, siteConfig.webhookSecret ?? "", payload).catch(() => {
    // fire-and-forget — errors are recorded in WebhookDelivery
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function buildPayload(
  session: { id: string; visitorId: string | null; siteUrl: string; exitPage: string | null; cartValue: number; startedAt: Date; totalTimeOnSiteMs: number | null },
  sessionId: string,
): Promise<SessionExitPayload> {
  // Get top friction IDs from events
  const events = await EventRepo.getEventsBySession(sessionId, { limit: 500 });
  const frictionCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.frictionId) frictionCounts[e.frictionId] = (frictionCounts[e.frictionId] ?? 0) + 1;
  }
  const topFrictionIds = Object.entries(frictionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  // Get last 5 products viewed
  const productEvents = events
    .filter((e) => e.eventType === "product_detail_view" || e.eventType === "product_click")
    .slice(-5);
  const productsViewed = productEvents.map((e) => {
    try {
      const raw = JSON.parse(e.rawSignals);
      return String(raw.product_name ?? raw.product_id ?? "unknown");
    } catch {
      return "unknown";
    }
  }).filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  // Get latest evaluation for tier + abandonment score
  const latestEval = await EvaluationRepo.getLatestEvaluation(sessionId);

  const sessionDurationMs = session.totalTimeOnSiteMs
    ?? (Date.now() - session.startedAt.getTime());

  return {
    visitorKey: session.visitorId ?? sessionId,
    siteUrl: session.siteUrl,
    sessionId,
    exitPage: session.exitPage,
    topFrictionIds,
    cartValue: session.cartValue,
    productsViewed,
    mswimTierAtExit: latestEval?.tier ?? null,
    abandonmentScore: latestEval?.abandonmentScore ?? null,
    sessionDurationMs,
  };
}

async function sendWithRetry(
  deliveryId: string,
  url: string,
  secret: string,
  payload: SessionExitPayload,
  attempt = 1,
): Promise<void> {
  const body = JSON.stringify({ event: "session_exit", payload });
  const signature = signPayload(body, secret);

  const lastAttemptAt = new Date();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AVA-Signature": signature,
        "X-AVA-Event": "session_exit",
        "User-Agent": "AVA-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      await WebhookDeliveryRepo.updateWebhookDelivery(deliveryId, {
        status: "delivered",
        attempts: attempt,
        lastAttemptAt,
        responseCode: response.status,
      });
      return;
    }

    // Non-2xx — retry if attempts remain
    if (attempt < 3) {
      const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s
      setTimeout(() => sendWithRetry(deliveryId, url, secret, payload, attempt + 1), backoffMs);
    } else {
      await WebhookDeliveryRepo.updateWebhookDelivery(deliveryId, {
        status: "failed",
        attempts: attempt,
        lastAttemptAt,
        responseCode: response.status,
        errorMessage: `HTTP ${response.status}`,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (attempt < 3) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      setTimeout(() => sendWithRetry(deliveryId, url, secret, payload, attempt + 1), backoffMs);
    } else {
      await WebhookDeliveryRepo.updateWebhookDelivery(deliveryId, {
        status: "failed",
        attempts: attempt,
        lastAttemptAt,
        errorMessage: errorMsg,
      }).catch(() => {});
    }
  }
}

function signPayload(body: string, secret: string): string {
  if (!secret) return "";
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}
