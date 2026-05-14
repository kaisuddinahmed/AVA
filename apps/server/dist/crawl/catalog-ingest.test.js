// ============================================================================
// Catalog ingest service — unit tests with mocked SiteCatalogRepo + fetch.
// Covers transform correctness, availability derivation, pagination, error
// isolation, maxProducts cap, and Storefront error propagation.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
// ── Mock @ava/db before importing the service under test ────────────────────
vi.mock("@ava/db", () => ({
    SiteCatalogRepo: {
        upsertProduct: vi.fn(),
    },
}));
import { SiteCatalogRepo } from "@ava/db";
import { ingestProducts, ingestShopifyCatalog, toCatalogInput, } from "./catalog-ingest.service.js";
import { ShopifyStorefrontError } from "./shopify-storefront.client.js";
// ── Helpers ─────────────────────────────────────────────────────────────────
const upsertMock = SiteCatalogRepo.upsertProduct;
function product(overrides = {}) {
    return {
        id: "gid://shopify/Product/1",
        handle: "raw-linen-tee",
        title: "Raw Linen Tee",
        description: "Lightweight raw linen.",
        productType: "Top",
        vendor: "Example Brand",
        tags: ["new"],
        availableForSale: true,
        onlineStoreUrl: "https://example.myshopify.com/products/raw-linen-tee",
        imageUrl: "https://cdn.shopify.com/img.jpg",
        priceMin: 48,
        priceMax: 48,
        currency: "USD",
        variants: [{
                id: "gid://shopify/ProductVariant/11",
                title: "M",
                sku: "RLT-M",
                price: 48,
                availableForSale: true,
                quantityAvailable: 12,
                options: [{ name: "Size", value: "M" }],
            }],
        ...overrides,
    };
}
function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}
/** Build a Storefront API response body for `listProducts`. */
function storefrontBody(opts) {
    return {
        data: {
            products: {
                pageInfo: { hasNextPage: opts.hasNext ?? false, endCursor: opts.endCursor ?? null },
                edges: opts.products.map((p) => ({
                    node: {
                        id: p.id,
                        handle: p.handle,
                        title: p.title,
                        description: p.description,
                        productType: p.productType,
                        vendor: p.vendor,
                        tags: p.tags,
                        availableForSale: p.availableForSale,
                        onlineStoreUrl: p.onlineStoreUrl,
                        priceRange: {
                            minVariantPrice: { amount: String(p.priceMin ?? 0), currencyCode: p.currency },
                            maxVariantPrice: { amount: String(p.priceMax ?? 0), currencyCode: p.currency },
                        },
                        featuredImage: p.imageUrl ? { url: p.imageUrl, altText: null } : null,
                        variants: {
                            edges: p.variants.map((v) => ({
                                node: {
                                    id: v.id,
                                    title: v.title,
                                    sku: v.sku,
                                    price: { amount: String(v.price), currencyCode: p.currency },
                                    availableForSale: v.availableForSale,
                                    quantityAvailable: v.quantityAvailable,
                                    selectedOptions: v.options,
                                },
                            })),
                        },
                    },
                })),
            },
        },
    };
}
beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({});
});
// ── Transform ───────────────────────────────────────────────────────────────
describe("toCatalogInput — transform", () => {
    it("maps Storefront fields onto the SiteCatalog upsert input", () => {
        const input = toCatalogInput("https://example.myshopify.com", product());
        expect(input).toMatchObject({
            siteUrl: "https://example.myshopify.com",
            externalId: "gid://shopify/Product/1",
            handle: "raw-linen-tee",
            title: "Raw Linen Tee",
            vendor: "Example Brand",
            productType: "Top",
            imageUrl: "https://cdn.shopify.com/img.jpg",
            priceMin: 48,
            priceMax: 48,
            currency: "USD",
            availability: "in_stock",
            source: "shopify_storefront",
        });
        expect(JSON.parse(input.tags ?? "[]")).toEqual(["new"]);
        expect(JSON.parse(input.variants)).toHaveLength(1);
    });
    it("defaults currency to USD when blank", () => {
        const input = toCatalogInput("https://x.test", product({ currency: "" }));
        expect(input.currency).toBe("USD");
    });
});
describe("toCatalogInput — availability derivation", () => {
    it("returns 'in_stock' when all variants are available", () => {
        const p = product();
        p.variants[0].availableForSale = true;
        expect(toCatalogInput("x", p).availability).toBe("in_stock");
    });
    it("returns 'out_of_stock' when no variants are available", () => {
        const p = product();
        p.variants[0].availableForSale = false;
        expect(toCatalogInput("x", p).availability).toBe("out_of_stock");
    });
    it("returns 'partial' when some variants are unavailable", () => {
        const p = product();
        p.variants = [
            { ...p.variants[0], id: "v1", availableForSale: true },
            { ...p.variants[0], id: "v2", availableForSale: false },
        ];
        expect(toCatalogInput("x", p).availability).toBe("partial");
    });
    it("falls back to product-level availableForSale when no variants exist", () => {
        const p = product({ variants: [] });
        p.availableForSale = false;
        expect(toCatalogInput("x", p).availability).toBe("out_of_stock");
    });
});
// ── Single-page ingest ──────────────────────────────────────────────────────
describe("ingestProducts — per-page persistence", () => {
    it("upserts every ingestable product", async () => {
        const result = await ingestProducts("https://x.test", [
            product({ id: "p1", handle: "a" }),
            product({ id: "p2", handle: "b" }),
        ]);
        expect(result).toEqual({ ingested: 2, skipped: 0, errored: 0 });
        expect(upsertMock).toHaveBeenCalledTimes(2);
    });
    it("skips products missing required fields without erroring", async () => {
        const result = await ingestProducts("https://x.test", [
            product({ id: "p1", handle: "" }), // missing handle
            product({ id: "", handle: "b" }), // missing id
            product({ id: "p3", handle: "c", title: "" }), // missing title
            product({ id: "p4", handle: "d" }), // valid
        ]);
        expect(result).toEqual({ ingested: 1, skipped: 3, errored: 0 });
        expect(upsertMock).toHaveBeenCalledTimes(1);
    });
    it("isolates per-product upsert failures (one bad row doesn't halt the batch)", async () => {
        upsertMock.mockReset();
        upsertMock.mockResolvedValueOnce({});
        upsertMock.mockRejectedValueOnce(new Error("constraint violation"));
        upsertMock.mockResolvedValueOnce({});
        const result = await ingestProducts("https://x.test", [
            product({ id: "p1" }),
            product({ id: "p2" }),
            product({ id: "p3" }),
        ]);
        expect(result).toEqual({ ingested: 2, skipped: 0, errored: 1 });
    });
});
// ── Orchestrator: pagination + caps + error propagation ─────────────────────
describe("ingestShopifyCatalog — pagination", () => {
    it("walks every page and persists products from each before fetching the next", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(storefrontBody({
            products: [product({ id: "p1", handle: "a" }), product({ id: "p2", handle: "b" })],
            hasNext: true, endCursor: "c1",
        })))
            .mockResolvedValueOnce(jsonResponse(storefrontBody({
            products: [product({ id: "p3", handle: "c" })],
            hasNext: false, endCursor: null,
        })));
        const result = await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "tok", {
            fetchImpl: fetchMock, pageSize: 10,
        });
        expect(result.ingested).toBe(3);
        expect(result.pagesWalked).toBe(2);
        expect(result.endCursor).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).variables.after).toBe("c1");
    });
});
describe("ingestShopifyCatalog — caps", () => {
    it("stops at maxProducts even if more pages exist", async () => {
        const body = () => storefrontBody({
            products: Array.from({ length: 10 }, (_, i) => product({ id: `p${i}`, handle: `h${i}` })),
            hasNext: true,
            endCursor: "next",
        });
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(body()));
        const result = await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "tok", {
            fetchImpl: fetchMock, pageSize: 10, maxProducts: 15,
        });
        expect(result.ingested).toBe(15);
        expect(result.endCursor).toBe("next"); // cursor retained so caller can resume
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
describe("ingestShopifyCatalog — error propagation", () => {
    it("re-throws ShopifyStorefrontError unchanged so the wizard sees the kind", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
        try {
            await ingestShopifyCatalog("https://x.test", "x.myshopify.com", "bad-tok", { fetchImpl: fetchMock });
            throw new Error("should have thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(ShopifyStorefrontError);
            expect(err.kind).toBe("unauthorized");
        }
    });
});
//# sourceMappingURL=catalog-ingest.test.js.map