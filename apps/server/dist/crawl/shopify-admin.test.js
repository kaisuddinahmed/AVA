// ============================================================================
// Shopify Admin API client — unit tests with mocked fetch.
// ============================================================================
import { describe, it, expect, vi } from "vitest";
import { listProducts, listAllProducts, getShopInfo, ShopifyAdminError, } from "./shopify-admin.client.js";
function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}
function nodeProduct(overrides = {}) {
    return {
        id: overrides.id ?? "gid://shopify/Product/1",
        handle: overrides.handle ?? "raw-linen-tee",
        title: overrides.title ?? "Raw Linen Tee",
        description: "Linen.",
        productType: "Top",
        vendor: "Example Brand",
        tags: ["new"],
        status: "ACTIVE",
        totalInventory: overrides.inv ?? 12,
        onlineStoreUrl: "https://example.myshopify.com/products/raw-linen-tee",
        featuredImage: { url: "https://cdn.shopify.com/img.jpg" },
        priceRangeV2: {
            minVariantPrice: { amount: overrides.price ?? "48.00", currencyCode: "USD" },
            maxVariantPrice: { amount: overrides.price ?? "48.00", currencyCode: "USD" },
        },
        variants: {
            edges: [{
                    node: {
                        id: "gid://shopify/ProductVariant/11",
                        title: "M",
                        sku: "RLT-M",
                        price: overrides.price ?? "48.00",
                        inventoryQuantity: overrides.inv ?? 12,
                        inventoryPolicy: "DENY",
                        selectedOptions: [{ name: "Size", value: "M" }],
                    },
                }],
        },
    };
}
function listProductsBody(opts) {
    return {
        data: {
            products: {
                pageInfo: { hasNextPage: opts.hasNext ?? false, endCursor: opts.endCursor ?? null },
                edges: opts.products.map((node) => ({ node })),
            },
        },
    };
}
// ── Request shape ───────────────────────────────────────────────────────────
describe("Admin.listProducts — request shape", () => {
    it("posts to the versioned Admin endpoint with the correct token header", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(listProductsBody({ products: [nodeProduct()] })));
        await listProducts("https://example.myshopify.com", "shpat_admin", null, { fetchImpl: fetchMock });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.myshopify.com/admin/api/2024-10/graphql.json");
        const headers = init?.headers;
        expect(headers["X-Shopify-Access-Token"]).toBe("shpat_admin");
        expect(headers["X-Shopify-Storefront-Access-Token"]).toBeUndefined();
        const body = JSON.parse(String(init?.body));
        expect(body.query).toContain("query AdminListProducts");
        expect(body.variables).toEqual({ first: 50, after: null });
    });
    it("clamps page size to [1, 250]", async () => {
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(listProductsBody({ products: [] })));
        await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock, pageSize: 9999 });
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).variables.first).toBe(250);
    });
});
// ── Transform ───────────────────────────────────────────────────────────────
describe("Admin.listProducts — response transform", () => {
    it("captures status + totalInventory + inventoryQuantity (Storefront can't)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(listProductsBody({ products: [nodeProduct({ inv: 7 })] })));
        const r = await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock });
        const p = r.products[0];
        expect(p).toMatchObject({
            status: "ACTIVE",
            totalInventory: 7,
            currency: "USD",
        });
        expect(p.variants[0].inventoryQuantity).toBe(7);
        expect(p.variants[0].inventoryPolicy).toBe("DENY");
    });
    it("handles null totalInventory (tracking disabled)", async () => {
        const p = nodeProduct();
        p.totalInventory = null;
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(listProductsBody({ products: [p] })));
        const r = await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock });
        expect(r.products[0].totalInventory).toBeNull();
    });
});
// ── Pagination ──────────────────────────────────────────────────────────────
describe("Admin.listAllProducts — drain pagination", () => {
    it("walks every page until hasNextPage=false", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(listProductsBody({ products: [nodeProduct({ id: "p1" })], hasNext: true, endCursor: "c1" })))
            .mockResolvedValueOnce(jsonResponse(listProductsBody({ products: [nodeProduct({ id: "p2" })], hasNext: false, endCursor: null })));
        const all = await listAllProducts("x.myshopify.com", "tok", { fetchImpl: fetchMock });
        expect(all.length).toBe(2);
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).variables.after).toBe("c1");
    });
    it("respects maxProducts cap", async () => {
        const body = () => listProductsBody({
            products: Array.from({ length: 10 }, (_, i) => nodeProduct({ id: `p${i}` })),
            hasNext: true,
            endCursor: "c",
        });
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(body()));
        const all = await listAllProducts("x.myshopify.com", "tok", {
            fetchImpl: fetchMock, pageSize: 10, maxProducts: 25,
        });
        expect(all.length).toBe(25);
    });
});
// ── Error taxonomy ──────────────────────────────────────────────────────────
describe("ShopifyAdminError — kinds", () => {
    it("401 → unauthorized", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
        await expect(listProducts("x.myshopify.com", "bad", null, { fetchImpl: fetchMock }))
            .rejects.toMatchObject({ kind: "unauthorized" });
    });
    it("403 → forbidden", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
        await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
            .rejects.toMatchObject({ kind: "forbidden" });
    });
    it("404 → not_found", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
        await expect(listProducts("nope.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
            .rejects.toMatchObject({ kind: "not_found" });
    });
    it("423 LOCKED → forbidden with status 423 (Shopify-locked shop)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 423 }));
        try {
            await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock });
            throw new Error("should have thrown");
        }
        catch (e) {
            expect(e).toBeInstanceOf(ShopifyAdminError);
            expect(e.kind).toBe("forbidden");
            expect(e.status).toBe(423);
        }
    });
    it("429 → rate_limited with retryAfterSec", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "5" } }));
        try {
            await listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock });
            throw new Error("should have thrown");
        }
        catch (e) {
            expect(e.retryAfterSec).toBe(5);
        }
    });
    it("graphql errors[] → graphql kind", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ errors: [{ message: "Throttled" }] }));
        await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
            .rejects.toMatchObject({ kind: "graphql" });
    });
    it("fetch throw → network kind", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("DNS failure"));
        await expect(listProducts("x.myshopify.com", "tok", null, { fetchImpl: fetchMock }))
            .rejects.toMatchObject({ kind: "network" });
    });
});
// ── Delegated Storefront token (Phase 1.3.2) ───────────────────────────────
import { createDelegatedStorefrontToken } from "./shopify-admin.client.js";
describe("Admin.createDelegatedStorefrontToken", () => {
    it("mints a Storefront token via the Admin storefrontAccessTokenCreate mutation", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            data: {
                storefrontAccessTokenCreate: {
                    storefrontAccessToken: {
                        accessToken: "shpat_storefront_delegated_xyz",
                        title: "AVA Phase 1.3",
                        accessScopes: [
                            { handle: "unauthenticated_read_product_listings" },
                            { handle: "unauthenticated_read_product_inventory" },
                        ],
                    },
                    userErrors: [],
                },
            },
        }));
        const r = await createDelegatedStorefrontToken("https://example.myshopify.com", "shpat_admin", "AVA Phase 1.3", { fetchImpl: fetchMock });
        expect(r.accessToken).toBe("shpat_storefront_delegated_xyz");
        expect(r.title).toBe("AVA Phase 1.3");
        expect(r.scopes).toEqual([
            "unauthenticated_read_product_listings",
            "unauthenticated_read_product_inventory",
        ]);
        // Verify the request shape
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.myshopify.com/admin/api/2024-10/graphql.json");
        const body = JSON.parse(String(init?.body));
        expect(body.query).toContain("storefrontAccessTokenCreate");
        expect(body.variables).toEqual({ input: { title: "AVA Phase 1.3" } });
        const headers = init?.headers;
        expect(headers["X-Shopify-Access-Token"]).toBe("shpat_admin");
    });
    it("throws graphql kind on userErrors", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            data: {
                storefrontAccessTokenCreate: {
                    storefrontAccessToken: null,
                    userErrors: [{ field: ["title"], message: "Title must be unique" }],
                },
            },
        }));
        await expect(createDelegatedStorefrontToken("x.myshopify.com", "tok", "duplicate", { fetchImpl: fetchMock })).rejects.toMatchObject({ kind: "graphql" });
    });
    it("throws malformed_response when the token field is unexpectedly null without userErrors", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            data: {
                storefrontAccessTokenCreate: {
                    storefrontAccessToken: null,
                    userErrors: [],
                },
            },
        }));
        await expect(createDelegatedStorefrontToken("x.myshopify.com", "tok", "AVA", { fetchImpl: fetchMock })).rejects.toMatchObject({ kind: "malformed_response" });
    });
    it("propagates 401 → unauthorized so the OAuth flow can re-prompt", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
        await expect(createDelegatedStorefrontToken("x.myshopify.com", "bad", "AVA", { fetchImpl: fetchMock })).rejects.toMatchObject({ kind: "unauthorized" });
    });
});
// ── Shop info ───────────────────────────────────────────────────────────────
describe("Admin.getShopInfo", () => {
    it("returns shop name, primary domain, currency, and main theme", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            data: {
                shop: { name: "Example Brand", primaryDomain: { url: "https://example-brand.com" }, currencyCode: "USD" },
                themes: { edges: [
                        { node: { name: "Dawn 8.0", role: "MAIN" } },
                        { node: { name: "Backup Theme", role: "UNPUBLISHED" } },
                    ] },
            },
        }));
        const info = await getShopInfo("x.myshopify.com", "tok", { fetchImpl: fetchMock });
        expect(info).toEqual({
            name: "Example Brand",
            primaryDomain: "https://example-brand.com",
            currencyCode: "USD",
            theme: "Dawn 8.0",
        });
    });
    it("falls back to null theme when none has MAIN role", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            data: {
                shop: { name: "Brand", primaryDomain: { url: "https://x.test" }, currencyCode: "USD" },
                themes: { edges: [] },
            },
        }));
        const info = await getShopInfo("x.myshopify.com", "tok", { fetchImpl: fetchMock });
        expect(info.theme).toBeNull();
    });
});
// ── Webhook subscription registration (Phase 1.3.5) ─────────────────────────
import { registerProductWebhooks } from "./shopify-admin.client.js";
function webhookCreateBody(opts) {
    return {
        data: {
            webhookSubscriptionCreate: {
                webhookSubscription: opts.id === undefined
                    ? { id: "gid://shopify/WebhookSubscription/auto" }
                    : opts.id === null ? null : { id: opts.id },
                userErrors: opts.userErrors ?? [],
            },
        },
    };
}
describe("Admin.registerProductWebhooks", () => {
    it("subscribes to PRODUCTS_CREATE, PRODUCTS_UPDATE, PRODUCTS_DELETE with correct callback URLs", async () => {
        let call = 0;
        const ids = [
            "gid://shopify/WebhookSubscription/1",
            "gid://shopify/WebhookSubscription/2",
            "gid://shopify/WebhookSubscription/3",
        ];
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(webhookCreateBody({ id: ids[call++] })));
        const result = await registerProductWebhooks("https://example.myshopify.com", "shpat_admin", "https://app.ava.test", { fetchImpl: fetchMock });
        expect(result.registered).toHaveLength(3);
        expect(result.failed).toHaveLength(0);
        expect(result.registered.map((r) => r.topic)).toEqual([
            "PRODUCTS_CREATE",
            "PRODUCTS_UPDATE",
            "PRODUCTS_DELETE",
        ]);
        expect(result.registered.map((r) => r.id)).toEqual(ids);
        expect(result.registered.every((r) => r.alreadyExisted === false)).toBe(true);
        // Inspect each request body — assert topic + uri wiring. Note: the field
        // is `uri` (current 2024-10 schema), NOT the legacy `callbackUrl`.
        const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
        expect(bodies[0].variables).toEqual({
            topic: "PRODUCTS_CREATE",
            webhookSubscription: {
                uri: "https://app.ava.test/api/shopify/webhooks/products/create",
                format: "JSON",
            },
        });
        expect(bodies[1].variables.topic).toBe("PRODUCTS_UPDATE");
        expect(bodies[1].variables.webhookSubscription.uri).toBe("https://app.ava.test/api/shopify/webhooks/products/update");
        expect(bodies[2].variables.topic).toBe("PRODUCTS_DELETE");
        expect(bodies[2].variables.webhookSubscription.uri).toBe("https://app.ava.test/api/shopify/webhooks/products/delete");
        // Guard against regression to the deprecated field name.
        expect(bodies[0].variables.webhookSubscription.callbackUrl).toBeUndefined();
        // X-Shopify-Access-Token must be the admin token (not the storefront one)
        const headers = fetchMock.mock.calls[0][1]?.headers;
        expect(headers["X-Shopify-Access-Token"]).toBe("shpat_admin");
    });
    it("strips trailing slash from the callback base URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(webhookCreateBody({})));
        await registerProductWebhooks("https://example.myshopify.com", "shpat_admin", "https://app.ava.test/", // trailing slash
        { fetchImpl: fetchMock });
        const url = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
            .variables.webhookSubscription.uri;
        expect(url).toBe("https://app.ava.test/api/shopify/webhooks/products/create");
    });
    it("treats 'already taken' userError as success (idempotent re-install)", async () => {
        let call = 0;
        const fetchMock = vi.fn().mockImplementation(async () => {
            call++;
            if (call === 2) {
                // PRODUCTS_UPDATE was already subscribed from a prior install.
                return jsonResponse(webhookCreateBody({
                    id: null,
                    userErrors: [{ field: ["uri"], message: "Address for this topic has already been taken" }],
                }));
            }
            return jsonResponse(webhookCreateBody({ id: `gid://shopify/WebhookSubscription/${call}` }));
        });
        const result = await registerProductWebhooks("https://example.myshopify.com", "shpat_admin", "https://app.ava.test", { fetchImpl: fetchMock });
        expect(result.failed).toHaveLength(0);
        expect(result.registered).toHaveLength(3);
        expect(result.registered[1]).toMatchObject({
            topic: "PRODUCTS_UPDATE",
            alreadyExisted: true,
            id: "",
        });
    });
    it("partial failure — one topic errors, others still succeed", async () => {
        let call = 0;
        const fetchMock = vi.fn().mockImplementation(async () => {
            call++;
            if (call === 3) {
                // PRODUCTS_DELETE fails with a non-idempotent error
                return jsonResponse(webhookCreateBody({
                    id: null,
                    userErrors: [{ field: ["uri"], message: "URL is not allowed (not HTTPS)" }],
                }));
            }
            return jsonResponse(webhookCreateBody({ id: `gid://shopify/WebhookSubscription/${call}` }));
        });
        const result = await registerProductWebhooks("https://example.myshopify.com", "shpat_admin", "https://app.ava.test", { fetchImpl: fetchMock });
        expect(result.registered).toHaveLength(2);
        expect(result.registered.map((r) => r.topic)).toEqual(["PRODUCTS_CREATE", "PRODUCTS_UPDATE"]);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].topic).toBe("PRODUCTS_DELETE");
        expect(result.failed[0].reason).toMatch(/HTTPS/);
    });
    it("network errors are reported per-topic in `failed`, not thrown", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("DNS failure"));
        const result = await registerProductWebhooks("https://example.myshopify.com", "shpat_admin", "https://app.ava.test", { fetchImpl: fetchMock });
        expect(result.registered).toHaveLength(0);
        expect(result.failed).toHaveLength(3);
        expect(result.failed.every((f) => /DNS failure/.test(f.reason))).toBe(true);
    });
});
//# sourceMappingURL=shopify-admin.test.js.map