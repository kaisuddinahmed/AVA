// ============================================================================
// Shopify product webhooks — keep SiteCatalog fresh without polling.
//
// Phase 1.3.4. The OAuth install (1.3.5) subscribes this endpoint to:
//   - products/update — fired on any product mutation
//   - products/create — fired on new products
//   - products/delete — fired when a product is removed
//
// Security: every webhook MUST pass HMAC verification via the
// `x-shopify-hmac-sha256` header. Unverified requests get 401.
//
// SLO: Shopify expects a 2xx response within 5 seconds, else it retries
// (up to 19 times over 48h). We acknowledge immediately and do the work
// fire-and-forget so slow DB writes never trigger duplicate deliveries.
// ============================================================================
import { createHmac, timingSafeEqual } from "crypto";
import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";
import { logger } from "../logger.js";
const log = logger.child({ service: "shopify-webhooks" });
// ---------------------------------------------------------------------------
// HMAC verification — same scheme as the legacy webhook handlers
// (uninstall, GDPR) in shopify.api.ts.
// ---------------------------------------------------------------------------
function verifyWebhookHmac(rawBody, hmacHeader, apiSecret) {
    if (!hmacHeader || !apiSecret)
        return false;
    const digest = createHmac("sha256", apiSecret).update(rawBody).digest("base64");
    try {
        const a = Buffer.from(digest, "utf8");
        const b = Buffer.from(hmacHeader, "utf8");
        if (a.length !== b.length)
            return false;
        return timingSafeEqual(a, b);
    }
    catch {
        return false;
    }
}
function getApiSecret() {
    return process.env.SHOPIFY_API_SECRET ?? "";
}
// ---------------------------------------------------------------------------
// Transform: REST product → SiteCatalog upsert input
// ---------------------------------------------------------------------------
function deriveAvailability(p) {
    const variants = p.variants ?? [];
    if (variants.length === 0)
        return "out_of_stock";
    const available = variants.filter((v) => (v.inventory_quantity ?? 0) > 0 || v.inventory_policy === "continue").length;
    if (available === 0)
        return "out_of_stock";
    if (available === variants.length)
        return "in_stock";
    return "partial";
}
function priceRange(p) {
    const prices = (p.variants ?? [])
        .map((v) => Number(v.price))
        .filter((n) => Number.isFinite(n));
    if (prices.length === 0)
        return { min: null, max: null };
    return { min: Math.min(...prices), max: Math.max(...prices) };
}
function variantOptions(v) {
    const out = [];
    if (v.option1)
        out.push({ name: "Option1", value: v.option1 });
    if (v.option2)
        out.push({ name: "Option2", value: v.option2 });
    if (v.option3)
        out.push({ name: "Option3", value: v.option3 });
    return out;
}
export function toCatalogInput(siteUrl, p) {
    const { min, max } = priceRange(p);
    const variants = (p.variants ?? []).map((v) => ({
        id: `gid://shopify/ProductVariant/${v.id}`,
        title: v.title,
        sku: v.sku ?? null,
        price: Number(v.price) || 0,
        availableForSale: (v.inventory_quantity ?? 0) > 0 || v.inventory_policy === "continue",
        quantityAvailable: v.inventory_quantity ?? null,
        options: variantOptions(v),
    }));
    return {
        siteUrl,
        externalId: `gid://shopify/Product/${p.id}`,
        handle: p.handle ?? null,
        title: p.title ?? "",
        description: p.body_html ?? null,
        vendor: p.vendor ?? null,
        productType: p.product_type ?? null,
        tags: JSON.stringify(p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : []),
        imageUrl: p.image?.src ?? null,
        url: p.handle ? `${siteUrl}/products/${p.handle}` : null,
        priceMin: min,
        priceMax: max,
        currency: "USD", // Shopify webhook payload doesn't include currency; SiteConfig records the shop default elsewhere
        variants: JSON.stringify(variants),
        availability: deriveAvailability(p),
        source: "shopify_webhook",
    };
}
// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
/**
 * POST /api/shopify/webhooks/products/update
 *
 * Fired by Shopify on any product update (and create — Shopify routes both
 * to the same endpoint by convention). We resolve the shop via the
 * `x-shopify-shop-domain` header, transform the REST payload, and upsert.
 *
 * Always returns 2xx to Shopify after HMAC verification — internal errors
 * are logged but not surfaced. This prevents 19-attempt retry storms.
 */
export async function webhookProductsUpdate(req, res) {
    const rawBody = req.body;
    const hmacHeader = req.headers["x-shopify-hmac-sha256"] ?? "";
    const shopDomain = req.headers["x-shopify-shop-domain"] ?? "";
    if (!verifyWebhookHmac(rawBody, hmacHeader, getApiSecret())) {
        return res.status(401).send("Unauthorized");
    }
    // Always ack first. Shopify retries on 5xx but we'd rather log a failure
    // than re-fire downstream side effects.
    res.status(200).send("OK");
    try {
        if (!shopDomain) {
            log.warn("[Shopify/products.update] missing x-shopify-shop-domain header");
            return;
        }
        const siteUrl = `https://${shopDomain}`;
        const site = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
        if (!site) {
            log.warn({ shopDomain }, "[Shopify/products.update] no SiteConfig — ignoring");
            return;
        }
        let payload;
        try {
            payload = JSON.parse(rawBody.toString());
        }
        catch (err) {
            log.warn({ err, shopDomain }, "[Shopify/products.update] malformed JSON payload");
            return;
        }
        if (!payload || typeof payload.id !== "number") {
            log.warn({ shopDomain }, "[Shopify/products.update] payload missing required id");
            return;
        }
        await SiteCatalogRepo.upsertProduct(toCatalogInput(siteUrl, payload));
        log.info({ shopDomain, productId: payload.id, handle: payload.handle }, "[Shopify/products.update] catalog upserted");
    }
    catch (err) {
        log.error({ err, shopDomain }, "[Shopify/products.update] processing failed");
    }
}
/**
 * POST /api/shopify/webhooks/products/delete
 *
 * Shopify only sends `{ id: <number> }` for delete. We remove the matching
 * SiteCatalog row.
 */
export async function webhookProductsDelete(req, res) {
    const rawBody = req.body;
    const hmacHeader = req.headers["x-shopify-hmac-sha256"] ?? "";
    const shopDomain = req.headers["x-shopify-shop-domain"] ?? "";
    if (!verifyWebhookHmac(rawBody, hmacHeader, getApiSecret())) {
        return res.status(401).send("Unauthorized");
    }
    res.status(200).send("OK");
    try {
        if (!shopDomain) {
            log.warn("[Shopify/products.delete] missing x-shopify-shop-domain header");
            return;
        }
        const siteUrl = `https://${shopDomain}`;
        let payload;
        try {
            payload = JSON.parse(rawBody.toString());
        }
        catch {
            log.warn({ shopDomain }, "[Shopify/products.delete] malformed JSON");
            return;
        }
        if (typeof payload.id !== "number") {
            log.warn({ shopDomain }, "[Shopify/products.delete] payload missing id");
            return;
        }
        // SiteCatalogRepo currently has no `deleteProduct(siteUrl, externalId)`.
        // Mark availability=out_of_stock instead — preserves history for the
        // dashboard while signalling that customers can't reach it.
        const externalId = `gid://shopify/Product/${payload.id}`;
        const existing = await SiteCatalogRepo.getProduct(siteUrl, externalId);
        if (!existing) {
            log.info({ shopDomain, productId: payload.id }, "[Shopify/products.delete] no row to mark");
            return;
        }
        await SiteCatalogRepo.upsertProduct({
            siteUrl,
            externalId,
            handle: existing.handle,
            title: existing.title,
            variants: existing.variants,
            availability: "out_of_stock",
            source: "shopify_webhook",
        });
        log.info({ shopDomain, productId: payload.id }, "[Shopify/products.delete] marked out_of_stock");
    }
    catch (err) {
        log.error({ err, shopDomain }, "[Shopify/products.delete] processing failed");
    }
}
//# sourceMappingURL=shopify-webhooks.api.js.map