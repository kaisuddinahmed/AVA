import type { Request, Response } from "express";
import { SiteCatalogRepo } from "@ava/db";
interface ShopifyWebhookProduct {
    id: number;
    title?: string;
    handle?: string;
    vendor?: string;
    product_type?: string;
    body_html?: string | null;
    tags?: string;
    status?: "active" | "archived" | "draft";
    image?: {
        src: string;
    } | null;
    variants?: Array<{
        id: number;
        title: string;
        sku?: string | null;
        price: string;
        inventory_quantity?: number | null;
        inventory_policy?: "continue" | "deny";
        option1?: string | null;
        option2?: string | null;
        option3?: string | null;
    }>;
    options?: Array<{
        name: string;
    }>;
}
export declare function toCatalogInput(siteUrl: string, p: ShopifyWebhookProduct): Parameters<typeof SiteCatalogRepo.upsertProduct>[0];
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
export declare function webhookProductsUpdate(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * POST /api/shopify/webhooks/products/delete
 *
 * Shopify only sends `{ id: <number> }` for delete. We remove the matching
 * SiteCatalog row.
 */
export declare function webhookProductsDelete(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export {};
//# sourceMappingURL=shopify-webhooks.api.d.ts.map