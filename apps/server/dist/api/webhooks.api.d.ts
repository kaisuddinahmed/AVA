import type { Request, Response } from "express";
/**
 * GET /api/webhooks/stats?siteUrl=
 * Returns 24h webhook delivery stats for a site.
 */
export declare function getWebhookStats(req: Request, res: Response): Promise<void>;
/**
 * PUT /api/webhooks/config?siteUrl=
 * Update webhook URL and secret for a site.
 */
export declare function updateWebhookConfig(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=webhooks.api.d.ts.map