import type { Request, Response } from "express";
/**
 * GET /api/shopify/install?shop=mystore.myshopify.com
 * Redirects merchant to Shopify OAuth consent screen.
 */
export declare function install(req: Request, res: Response): any;
/**
 * GET /api/shopify/callback?code=...&shop=...&hmac=...
 * OAuth callback: exchange code, inject ScriptTag, register webhooks.
 */
export declare function callback(req: Request, res: Response): Promise<any>;
/**
 * POST /api/shopify/webhooks/uninstall
 * Called by Shopify when merchant uninstalls the app.
 * Removes ScriptTag and clears Shopify credentials from SiteConfig.
 */
export declare function webhookUninstall(req: Request, res: Response): Promise<any>;
/**
 * POST /api/shopify/webhooks/gdpr/customers/data_request
 * GDPR: customer requests their data. AVA stores only anonymous visitorId —
 * no PII to return. Acknowledge and log.
 */
export declare function webhookCustomersDataRequest(req: Request, res: Response): any;
/**
 * POST /api/shopify/webhooks/gdpr/customers/redact
 * GDPR: erase customer data. Since AVA stores only anonymous visitorId, log and ack.
 */
export declare function webhookCustomersRedact(req: Request, res: Response): any;
/**
 * POST /api/shopify/webhooks/gdpr/shop/redact
 * GDPR: erase all shop data. Delete the SiteConfig and all associated data.
 */
export declare function webhookShopRedact(req: Request, res: Response): Promise<any>;
//# sourceMappingURL=shopify.api.d.ts.map