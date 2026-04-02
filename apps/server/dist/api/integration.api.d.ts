import type { Request, Response } from "express";
/**
 * POST /api/integration/generate
 * Body: { siteUrl: string }
 * Creates or updates a SiteConfig with a fresh siteKey (avak_<hex>) and returns
 * the installation snippet so the wizard can display the embed code immediately.
 */
export declare function generateIntegration(req: Request, res: Response): Promise<void>;
/**
 * GET /api/integration/:siteKey/install-status
 * Polls whether the AVA widget has been installed and is actively sending
 * events. Identified by siteKey (avak_<hex>) so the wizard doesn't need to
 * pass the siteUrl in a query param — the key is enough to look up the site.
 *
 * Status values (3-state):
 *   "not_found"       — no site for this siteKey, or site exists but 0 sessions
 *   "found_unverified"— sessions exist (1-2, low confidence — tag may have just loaded)
 *   "verified_ready"  — 3+ sessions or any session with meaningful events; widget confirmed
 */
export declare function getInstallStatus(req: Request, res: Response): Promise<void>;
/**
 * GET /api/widget.js
 * Serves the built AVA widget IIFE bundle with CORS headers so any site can
 * load it via a <script src="..."> tag.
 */
export declare function serveWidget(req: Request, res: Response): Promise<void>;
/**
 * POST /api/integration/:siteId/verify
 * Re-runs verification for the latest analyzer run (or an explicit runId).
 */
export declare function verifyIntegration(req: Request, res: Response): Promise<void>;
/**
 * POST /api/integration/:siteId/activate
 * Activates a site as `active` or `limited_active`.
 */
export declare function activateIntegration(req: Request, res: Response): Promise<void>;
/**
 * POST /api/site/reset?siteUrl=...
 * Resets a site's integration status back to "analyzing" (dormant).
 * Called by the demo wizard on startup so every demo session starts with the widget dormant.
 */
export declare function resetSiteStatus(req: Request, res: Response): Promise<void>;
/**
 * GET /api/site/status?siteUrl=...&siteKey=<optional>
 * Lightweight endpoint called by the widget on init to check if this site is activated.
 * Returns { status, activated } — no auth needed, read-only.
 *
 * When siteKey is present the server validates that it belongs to the given siteUrl.
 * A mismatched key is treated as an unactivated site (prevents siteUrl spoofing).
 */
export declare function getSiteStatus(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=integration.api.d.ts.map