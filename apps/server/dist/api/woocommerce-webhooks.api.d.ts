import type { Request, Response } from "express";
import { SiteCatalogRepo } from "@ava/db";
interface WooWebhookProduct {
    id: number;
    name?: string;
    slug?: string;
    permalink?: string;
    description?: string;
    short_description?: string;
    type?: string;
    status?: string;
    price?: string;
    regular_price?: string;
    sale_price?: string;
    images?: Array<{
        src: string;
    }>;
    tags?: Array<{
        name: string;
    }>;
    stock_status?: "instock" | "outofstock" | "onbackorder";
    stock_quantity?: number | null;
    manage_stock?: boolean;
    variations?: number[];
    sku?: string;
}
/**
 * Verify the `x-wc-webhook-signature` header against the raw body using the
 * site's stored shared secret. Constant-time comparison via timingSafeEqual.
 */
export declare function verifyWooSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean;
export declare function toCatalogInput(siteUrl: string, p: WooWebhookProduct): Parameters<typeof SiteCatalogRepo.upsertProduct>[0];
/**
 * POST /api/woocommerce/webhooks/products/update
 * Topics: product.created, product.updated (Woo routes both here).
 */
export declare function webhookProductsUpdate(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * POST /api/woocommerce/webhooks/products/delete
 * Topic: product.deleted. Marks SiteCatalog row out_of_stock (history-preserving).
 */
export declare function webhookProductsDelete(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export {};
//# sourceMappingURL=woocommerce-webhooks.api.d.ts.map