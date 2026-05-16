import type { Request, Response } from "express";
/**
 * POST /api/onboarding/woocommerce-quick
 *
 * Request:  { shopUrl, consumerKey?, consumerSecret?, maxProducts? }
 * Response: 200 { siteUrl, platform, products, sitemap, durationMs }
 *           400 validation / not-Woo
 *           401 invalid consumer credentials (caller re-prompts)
 *           404 site not reachable or Woo endpoint missing
 *           429 Woo rate limit
 *           502 upstream/network error
 */
export declare function wooCommerceQuickOnboard(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=onboarding-woo.api.d.ts.map