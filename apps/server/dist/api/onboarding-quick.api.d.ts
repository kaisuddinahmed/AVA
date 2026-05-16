import type { Request, Response } from "express";
/**
 * POST /api/onboarding/quick
 *
 * Request:  { shopUrl, storefrontToken?, consumerKey?, consumerSecret?, maxProducts? }
 * Response: 200 { siteId, platform, products, sitemap, durationMs, transport? }
 *           400 detection.platform=shopify but storefrontToken missing
 *           400 validation
 *           502 detection fetch failed
 */
export declare function quickOnboard(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=onboarding-quick.api.d.ts.map