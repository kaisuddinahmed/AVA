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
import { createHmac, timingSafeEqual } from "crypto";
import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";
import { logger } from "../logger.js";
const log = logger.child({ service: "woocommerce-webhooks" });
// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------
/**
 * Verify the `x-wc-webhook-signature` header against the raw body using the
 * site's stored shared secret. Constant-time comparison via timingSafeEqual.
 */
export function verifyWooSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader || !secret)
        return false;
    const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
    try {
        const a = Buffer.from(digest, "utf8");
        const b = Buffer.from(signatureHeader, "utf8");
        if (a.length !== b.length)
            return false;
        return timingSafeEqual(a, b);
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Transform: Woo REST product → SiteCatalog upsert input
// ---------------------------------------------------------------------------
function deriveAvailability(p) {
    if (p.status && p.status !== "publish")
        return "out_of_stock";
    if (p.stock_status === "outofstock")
        return "out_of_stock";
    return "in_stock";
}
function parseNumber(raw) {
    if (raw == null || raw === "")
        return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}
export function toCatalogInput(siteUrl, p) {
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
        variants: JSON.stringify((p.variations ?? []).map((id) => ({
            id: String(id),
            title: "",
            sku: null,
            price: price ?? 0,
            availableForSale: deriveAvailability(p) === "in_stock",
            quantityAvailable: null,
            options: [],
        }))),
        availability: deriveAvailability(p),
        source: "woocommerce_webhook",
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pickHeader(req, name) {
    return req.headers[name.toLowerCase()] ?? "";
}
/**
 * Look up the SiteConfig + webhook secret for the source URL Woo sent in
 * `x-wc-webhook-source`. Returns `null` (not found) or `{ siteUrl, secret }`
 * when we can verify the request.
 */
async function resolveSite(sourceHeader) {
    if (!sourceHeader)
        return null;
    let normalized;
    try {
        const u = new URL(sourceHeader);
        normalized = `${u.protocol}//${u.host}`;
    }
    catch {
        return null;
    }
    const site = await SiteConfigRepo.getSiteConfigByUrl(normalized);
    if (!site)
        return null;
    return { siteUrl: normalized, secret: site.wooWebhookSecret ?? null };
}
/**
 * Woo "ping" deliveries (created from WP-Admin UI) post `{ webhook_id: ... }`
 * with no resource payload. Detect + ack silently so we don't spam logs.
 */
function isPingPayload(payload) {
    return Boolean(payload &&
        typeof payload === "object" &&
        "webhook_id" in payload &&
        Object.keys(payload).length === 1);
}
// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
/**
 * POST /api/woocommerce/webhooks/products/update
 * Topics: product.created, product.updated (Woo routes both here).
 */
export async function webhookProductsUpdate(req, res) {
    const rawBody = req.body;
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
        let payload;
        try {
            payload = JSON.parse(rawBody.toString());
        }
        catch (err) {
            log.warn({ err, source }, "[Woo/products.update] malformed JSON payload");
            return;
        }
        if (isPingPayload(payload)) {
            log.info({ source, webhookId: payload.webhook_id }, "[Woo/products.update] ping ack");
            return;
        }
        if (!payload || typeof payload.id !== "number") {
            log.warn({ source, topic }, "[Woo/products.update] payload missing required id");
            return;
        }
        await SiteCatalogRepo.upsertProduct(toCatalogInput(site.siteUrl, payload));
        log.info({ source, productId: payload.id, topic }, "[Woo/products.update] catalog upserted");
    }
    catch (err) {
        log.error({ err, source }, "[Woo/products.update] processing failed");
    }
}
/**
 * POST /api/woocommerce/webhooks/products/delete
 * Topic: product.deleted. Marks SiteCatalog row out_of_stock (history-preserving).
 */
export async function webhookProductsDelete(req, res) {
    const rawBody = req.body;
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
        let payload;
        try {
            payload = JSON.parse(rawBody.toString());
        }
        catch {
            log.warn({ source }, "[Woo/products.delete] malformed JSON");
            return;
        }
        if (isPingPayload(payload))
            return;
        if (typeof payload.id !== "number") {
            log.warn({ source }, "[Woo/products.delete] payload missing id");
            return;
        }
        const externalId = `wc:${payload.id}`;
        const existing = await SiteCatalogRepo.getProduct(site.siteUrl, externalId);
        if (!existing) {
            log.info({ source, productId: payload.id }, "[Woo/products.delete] no row to mark");
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
        log.info({ source, productId: payload.id }, "[Woo/products.delete] marked out_of_stock");
    }
    catch (err) {
        log.error({ err, source }, "[Woo/products.delete] processing failed");
    }
}
//# sourceMappingURL=woocommerce-webhooks.api.js.map