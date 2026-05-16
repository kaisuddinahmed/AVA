// ============================================================================
// products/update + products/delete webhook handlers — unit tests.
//
// Pattern mirrors onboarding-shopify.test.ts: mock @ava/db repos + provide
// a Buffer body with a freshly-computed HMAC header.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
vi.mock("@ava/db", () => ({
    SiteCatalogRepo: {
        upsertProduct: vi.fn(),
        getProduct: vi.fn(),
    },
    SiteConfigRepo: {
        getSiteConfigByUrl: vi.fn(),
    },
}));
import { SiteCatalogRepo, SiteConfigRepo } from "@ava/db";
import { webhookProductsUpdate, webhookProductsDelete, toCatalogInput, } from "./shopify-webhooks.api.js";
const upsertMock = SiteCatalogRepo.upsertProduct;
const getProductMock = SiteCatalogRepo.getProduct;
const getSiteByUrlMock = SiteConfigRepo.getSiteConfigByUrl;
function mockRes() {
    let statusCode = 200;
    let body = undefined;
    const r = {
        status(n) { statusCode = n; return r; },
        send(b) { body = b; return r; },
        json(b) { body = b; return r; },
        getStatus() { return statusCode; },
        getBody() { return body; },
    };
    return r;
}
const asReq = (body, headers) => ({ body, headers });
const asRes = (m) => m;
const API_SECRET = "test_secret_shhh";
function signedHeaders(rawBody, shopDomain) {
    const hmac = createHmac("sha256", API_SECRET).update(rawBody).digest("base64");
    return {
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-shop-domain": shopDomain,
    };
}
function productPayload(overrides = {}) {
    return {
        id: overrides.id ?? 1234567890,
        title: overrides.title ?? "Raw Linen Tee",
        handle: overrides.handle ?? "raw-linen-tee",
        vendor: "Example Brand",
        product_type: "Top",
        body_html: "<p>Lightweight raw linen.</p>",
        tags: "new, linen, summer",
        status: "active",
        image: { src: "https://cdn.shopify.com/img.jpg" },
        variants: [
            {
                id: 9876,
                title: "M",
                sku: "RLT-M",
                price: "48.00",
                inventory_quantity: 12,
                inventory_policy: "deny",
                option1: "M",
                option2: null,
                option3: null,
            },
            {
                id: 9877,
                title: "L",
                sku: "RLT-L",
                price: "48.00",
                inventory_quantity: 0,
                inventory_policy: "deny",
                option1: "L",
                option2: null,
                option3: null,
            },
        ],
    };
}
beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({});
    getProductMock.mockReset();
    getProductMock.mockResolvedValue(null);
    getSiteByUrlMock.mockReset();
    getSiteByUrlMock.mockResolvedValue({ id: "sc_1", siteUrl: "https://example.myshopify.com" });
    process.env.SHOPIFY_API_SECRET = API_SECRET;
});
// ── Transform ───────────────────────────────────────────────────────────────
describe("toCatalogInput — Shopify REST → SiteCatalog", () => {
    it("maps REST fields to canonical catalog shape", () => {
        const input = toCatalogInput("https://example.myshopify.com", productPayload());
        expect(input).toMatchObject({
            siteUrl: "https://example.myshopify.com",
            externalId: "gid://shopify/Product/1234567890",
            handle: "raw-linen-tee",
            title: "Raw Linen Tee",
            vendor: "Example Brand",
            productType: "Top",
            imageUrl: "https://cdn.shopify.com/img.jpg",
            url: "https://example.myshopify.com/products/raw-linen-tee",
            priceMin: 48,
            priceMax: 48,
            source: "shopify_webhook",
        });
        expect(JSON.parse(input.tags ?? "[]")).toEqual(["new", "linen", "summer"]);
    });
    it("derives availability='partial' when only some variants have stock", () => {
        const input = toCatalogInput("https://x.test", productPayload());
        expect(input.availability).toBe("partial"); // 1 in stock + 1 out
    });
    it("derives availability='in_stock' when all variants have stock OR inventory_policy=continue", () => {
        const p = productPayload();
        p.variants[1].inventory_quantity = 5;
        expect(toCatalogInput("https://x.test", p).availability).toBe("in_stock");
        p.variants[1].inventory_quantity = 0;
        p.variants[1].inventory_policy = "continue";
        expect(toCatalogInput("https://x.test", p).availability).toBe("in_stock");
    });
    it("derives availability='out_of_stock' when no variants have stock", () => {
        const p = productPayload();
        p.variants.forEach((v) => { v.inventory_quantity = 0; });
        expect(toCatalogInput("https://x.test", p).availability).toBe("out_of_stock");
    });
    it("price range spans variants with different prices", () => {
        const p = productPayload();
        p.variants[1].price = "62.00";
        const input = toCatalogInput("https://x.test", p);
        expect(input.priceMin).toBe(48);
        expect(input.priceMax).toBe(62);
    });
});
// ── Update webhook — security + happy path ─────────────────────────────────
describe("webhookProductsUpdate — HMAC + upsert", () => {
    it("upserts the product to SiteCatalog on verified webhook", async () => {
        const body = Buffer.from(JSON.stringify(productPayload()));
        const req = asReq(body, signedHeaders(body, "example.myshopify.com"));
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(200);
        expect(upsertMock).toHaveBeenCalledTimes(1);
        expect(upsertMock.mock.calls[0][0]).toMatchObject({
            externalId: "gid://shopify/Product/1234567890",
            source: "shopify_webhook",
        });
    });
    it("401s on invalid HMAC (tampered body)", async () => {
        const body = Buffer.from(JSON.stringify(productPayload()));
        const headers = signedHeaders(body, "example.myshopify.com");
        // Tamper with the body AFTER computing HMAC
        const tampered = Buffer.from(JSON.stringify({ ...productPayload(), title: "TAMPERED" }));
        const req = asReq(tampered, headers);
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(401);
        expect(upsertMock).not.toHaveBeenCalled();
    });
    it("401s when HMAC header is missing", async () => {
        const body = Buffer.from(JSON.stringify(productPayload()));
        const req = asReq(body, { "x-shopify-shop-domain": "example.myshopify.com" });
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(401);
    });
    it("returns 200 (NOT 5xx) when shop domain is unknown, to avoid retry storm", async () => {
        getSiteByUrlMock.mockResolvedValueOnce(null);
        const body = Buffer.from(JSON.stringify(productPayload()));
        const req = asReq(body, signedHeaders(body, "unknown.myshopify.com"));
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(200);
        expect(upsertMock).not.toHaveBeenCalled();
    });
    it("returns 200 even when upsert throws — Shopify must not retry on our internal errors", async () => {
        upsertMock.mockReset();
        upsertMock.mockRejectedValueOnce(new Error("DB down"));
        const body = Buffer.from(JSON.stringify(productPayload()));
        const req = asReq(body, signedHeaders(body, "example.myshopify.com"));
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(200);
    });
    it("tolerates malformed JSON payloads (still acks)", async () => {
        const body = Buffer.from("not valid json");
        const req = asReq(body, signedHeaders(body, "example.myshopify.com"));
        const res = mockRes();
        await webhookProductsUpdate(req, asRes(res));
        expect(res.getStatus()).toBe(200);
        expect(upsertMock).not.toHaveBeenCalled();
    });
});
// ── Delete webhook ──────────────────────────────────────────────────────────
describe("webhookProductsDelete", () => {
    it("marks the existing row out_of_stock (preserves history)", async () => {
        getProductMock.mockResolvedValueOnce({
            handle: "raw-linen-tee",
            title: "Raw Linen Tee",
            variants: "[]",
        });
        const body = Buffer.from(JSON.stringify({ id: 1234567890 }));
        const req = asReq(body, signedHeaders(body, "example.myshopify.com"));
        const res = mockRes();
        await webhookProductsDelete(req, asRes(res));
        expect(res.getStatus()).toBe(200);
        expect(upsertMock).toHaveBeenCalledTimes(1);
        expect(upsertMock.mock.calls[0][0]).toMatchObject({
            externalId: "gid://shopify/Product/1234567890",
            availability: "out_of_stock",
        });
    });
    it("acks gracefully when the row doesn't exist", async () => {
        getProductMock.mockResolvedValueOnce(null);
        const body = Buffer.from(JSON.stringify({ id: 99 }));
        const req = asReq(body, signedHeaders(body, "example.myshopify.com"));
        const res = mockRes();
        await webhookProductsDelete(req, asRes(res));
        expect(res.getStatus()).toBe(200);
        expect(upsertMock).not.toHaveBeenCalled();
    });
    it("401s on invalid HMAC", async () => {
        const body = Buffer.from(JSON.stringify({ id: 1 }));
        const req = asReq(body, { "x-shopify-hmac-sha256": "wrong", "x-shopify-shop-domain": "x.myshopify.com" });
        const res = mockRes();
        await webhookProductsDelete(req, asRes(res));
        expect(res.getStatus()).toBe(401);
    });
});
//# sourceMappingURL=shopify-webhooks.test.js.map