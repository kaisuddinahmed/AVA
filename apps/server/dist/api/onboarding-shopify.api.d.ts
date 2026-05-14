import type { Request, Response } from "express";
/**
 * POST /api/onboarding/shopify-quick
 *
 * Request:  { shopUrl, storefrontToken, maxProducts? }
 * Response: 200 { siteUrl, platform, products, sitemap, durationMs }
 *           400 validation
 *           401 invalid Storefront token (caller re-prompts)
 *           404 shop not found
 *           429 Storefront rate limit
 *           502 upstream/network error
 */
export declare function shopifyQuickOnboard(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=onboarding-shopify.api.d.ts.map