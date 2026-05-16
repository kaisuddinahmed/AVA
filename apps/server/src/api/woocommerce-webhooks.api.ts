// ============================================================================
// WooCommerce webhook handlers — keep SiteCatalog fresh without polling.
//
// Phase 1.4.5. Woo webhooks differ from Shopify's:
//
//   Signature: `x-wc-webhook-signature` = base64( HMAC-SHA256( rawBody, secret ) )
//   Source   : `x-wc-webhook-source`    = origin store URL (we use this to
//                                          look up the per-site secret)
//   Topic    : `x-wc-webhook-topic`     = "product.created" / "product.updated"
//                                          / "product.deleted" (dots, not slashes)
//   Event    : `x-wc-webhook-event`     = "created" / "updated" / "deleted"
//   Resource : `x-wc-webhook-resource`  = "product"
//
// SLO: Woo retries deliveries on non-2xx; we always ack 200 after HMAC checks.
// ============================================================================

import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";
import { logger } from "../logger.js";

const log = logger.child({ service: "woocommerce-webhooks" });

// ---------------------------------------------------------------------------
// Woo REST product payload (subset — covers fields we map to SiteCatalog)
// ---------------------------------------------------------------------------

interface WooWebhookProduct {
  id: number;
  name?: string;
  slug?: string;
  permalink?: string;
  description?: string;
  short_description?: string;
  type?: string;          // simple | variable | grouped | external
  status?: string;        // publish | draft | private | pending
  price?: string;
  regular_price?: string;
  sale_price?: string;
  images?: Array<{ src: string }>;
  tags?: Array<{ name: string }>;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  stock_quantity?: number | null;
  manage_stock?: boolean;
  variations?: number[];
  sku?: string;
}

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

/**
 * Verify the `x-wc-webhook-signature` header against the raw body using the
 * site's stored shared secret. Constant-time comparison via timingSafeEqual.
 */
export function verifyWooSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Transform: Woo REST product → SiteCatalog upsert input
// ---------------------------------------------------------------------------

function deriveAvailability(p: WooWebhookProduct): "in_stock" | "out_of_stock" {
  if (p.status && p.status !== "publish") return "out_of_stock";
  if (p.stock_status === "outofstock") return "out_of_stock";
  return "in_stock";
}

function parseNumber(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function toCatalogInput(siteUrl: string, p: WooWebhookProduct): Parameters<typeof SiteCatalogRepo.upsertProduct>[0] {
  const tags = (p.tags ?? []).map((t) => t.name).filter(Boolean);
  const price = parseNumber(p.price);
  const regularPrice = parseNumber(p.regular_price);
  return {
    siteUrl,
    externalId: `wc:${p.id}`,
    handle: p.slug ?? null,
    title: p.name ?? "",
    description: p.description || p.short_description || null,
    vendor: null,
    productType: p.type ?? null,
    tags: JSON.stringify(tags),
    imageUrl: p.images?.[0]?.src ?? null,
    url: p.permalink ?? null,
    priceMin: price,
    priceMax: regularPrice ?? price,
    currency: "USD", // Woo webhook payload doesn't include currency; site default applies.
    variants: JSON.stringify(
      (p.variations ?? []).map((id) => ({
        id: String(id),
        title: "",
        sku: null,
        price: price ?? 0,
        availableForSale: deriveAvailability(p) === "in_stock",
        quantityAvailable: null,
        options: [],
      })),
    ),
    availability: deriveAvailability(p),
    source: "woocommerce_webhook",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickHeader(req: Request, name: string): string {
  return (req.headers[name.toLowerCase()] as string) ?? "";
}

/**
 * Look up the SiteConfig + webhook secret for the source URL Woo sent in
 * `x-wc-webhook-source`. Returns `null` (not found) or `{ siteUrl, secret }`
 * when we can verify the request.
 */
async function resolveSite(sourceHeader: string): Promise<{ siteUrl: string; secret: string | null } | null> {
  if (!sourceHeader) return null;
  let normalized: string;
  try {
    const u = new URL(sourceHeader);
    normalized = `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
  const site = await SiteConfigRepo.getSiteConfigByUrl(normalized);
  if (!site) return null;
  return { siteUrl: normalized, secret: site.wooWebhookSecret ?? null };
}

/**
 * Woo "ping" deliveries (created from WP-Admin UI) post `{ webhook_id: ... }`
 * with no resource payload. Detect + ack silently so we don't spam logs.
 */
function isPingPayload(payload: unknown): payload is { webhook_id: number } {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "webhook_id" in (payload as object) &&
      Object.keys(payload as object).length === 1,
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/woocommerce/webhooks/products/update
 * Topics: product.created, product.updated (Woo routes both here).
 */
export async function webhookProductsUpdate(req: Request, res: Response) {
  const rawBody = req.body as Buffer;
  const signature = pickHeader(req, "x-wc-webhook-signature");
  const source = pickHeader(req, "x-wc-webhook-source");
  const topic = pickHeader(req, "x-wc-webhook-topic");

  const site = await resolveSite(source);
  if (!site) {
    // Refuse rather than ack — an unknown source must NOT see a 200, or
    // Woo will assume the webhook is healthy and stop alerting us.
    return res.status(401).send("Unknown source");
  }
  if (!site.secret || !verifyWooSignature(rawBody, signature, site.secret)) {
    return res.status(401).send("Unauthorized");
  }
  res.status(200).send("OK");

  try {
    let payload: WooWebhookProduct | { webhook_id: number };
    try {
      payload = JSON.parse(rawBody.toString()) as WooWebhookProduct;
    } catch (err) {
      log.warn({ err, source }, "[Woo/products.update] malformed JSON payload");
      return;
    }
    if (isPingPayload(payload)) {
      log.info({ source, webhookId: payload.webhook_id }, "[Woo/products.update] ping ack");
      return;
    }
    if (!payload || typeof (payload as WooWebhookProduct).id !== "number") {
      log.warn({ source, topic }, "[Woo/products.update] payload missing required id");
      return;
    }
    await SiteCatalogRepo.upsertProduct(toCatalogInput(site.siteUrl, payload as WooWebhookProduct));
    log.info(
      { source, productId: (payload as WooWebhookProduct).id, topic },
      "[Woo/products.update] catalog upserted",
    );
  } catch (err) {
    log.error({ err, source }, "[Woo/products.update] processing failed");
  }
}

/**
 * POST /api/woocommerce/webhooks/products/delete
 * Topic: product.deleted. Marks SiteCatalog row out_of_stock (history-preserving).
 */
export async function webhookProductsDelete(req: Request, res: Response) {
  const rawBody = req.body as Buffer;
  const signature = pickHeader(req, "x-wc-webhook-signature");
  const source = pickHeader(req, "x-wc-webhook-source");

  const site = await resolveSite(source);
  if (!site) {
    return res.status(401).send("Unknown source");
  }
  if (!site.secret || !verifyWooSignature(rawBody, signature, site.secret)) {
    return res.status(401).send("Unauthorized");
  }
  res.status(200).send("OK");

  try {
    let payload: { id?: number } | { webhook_id: number };
    try {
      payload = JSON.parse(rawBody.toString()) as { id?: number };
    } catch {
      log.warn({ source }, "[Woo/products.delete] malformed JSON");
      return;
    }
    if (isPingPayload(payload)) return;
    if (typeof (payload as { id?: number }).id !== "number") {
      log.warn({ source }, "[Woo/products.delete] payload missing id");
      return;
    }
    const externalId = `wc:${(payload as { id: number }).id}`;
    const existing = await SiteCatalogRepo.getProduct(site.siteUrl, externalId);
    if (!existing) {
      log.info({ source, productId: (payload as { id: number }).id }, "[Woo/products.delete] no row to mark");
      return;
    }
    await SiteCatalogRepo.upsertProduct({
      siteUrl: site.siteUrl,
      externalId,
      handle: existing.handle,
      title: existing.title,
      variants: existing.variants,
      availability: "out_of_stock",
      source: "woocommerce_webhook",
    });
    log.info({ source, productId: (payload as { id: number }).id }, "[Woo/products.delete] marked out_of_stock");
  } catch (err) {
    log.error({ err, source }, "[Woo/products.delete] processing failed");
  }
}
