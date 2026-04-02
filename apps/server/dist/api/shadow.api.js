// ============================================================================
// Shadow Mode API — comparison data endpoints
// ============================================================================
import { ShadowComparisonRepo } from "@ava/db";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
// ---------------------------------------------------------------------------
// GET /api/shadow/stats
// Overall agreement rates and divergence distribution.
// ---------------------------------------------------------------------------
export async function getStats(_req, res) {
    try {
        const [stats, distribution] = await Promise.all([
            ShadowComparisonRepo.getStats(),
            ShadowComparisonRepo.getDivergenceDistribution(),
        ]);
        res.json({ ...stats, distribution });
    }
    catch (error) {
        log.error("[Shadow API] Stats error:", error);
        res.status(500).json({ error: "Failed to compute shadow stats" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/shadow/comparisons
// Paginated list with filters.
// Query: sessionId, tierMatch, decisionMatch, minDivergence, limit, offset
// ---------------------------------------------------------------------------
export async function listComparisons(req, res) {
    try {
        const options = {
            sessionId: req.query.sessionId,
            tierMatch: req.query.tierMatch !== undefined
                ? req.query.tierMatch === "true"
                : undefined,
            decisionMatch: req.query.decisionMatch !== undefined
                ? req.query.decisionMatch === "true"
                : undefined,
            minDivergence: req.query.minDivergence
                ? Number(req.query.minDivergence)
                : undefined,
            limit: req.query.limit ? Number(req.query.limit) : 50,
            offset: req.query.offset ? Number(req.query.offset) : 0,
        };
        const comparisons = await ShadowComparisonRepo.listComparisons(options);
        res.json({ count: comparisons.length, data: comparisons });
    }
    catch (error) {
        log.error("[Shadow API] List comparisons error:", error);
        res.status(500).json({ error: "Failed to list shadow comparisons" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/shadow/session/:sessionId
// All comparisons for a specific session.
// ---------------------------------------------------------------------------
export async function getSessionComparisons(req, res) {
    try {
        const sessionId = String(req.params.sessionId);
        const comparisons = await ShadowComparisonRepo.getComparisonsBySession(sessionId);
        res.json({ sessionId, count: comparisons.length, data: comparisons });
    }
    catch (error) {
        log.error("[Shadow API] Session comparisons error:", error);
        res.status(500).json({ error: "Failed to get session comparisons" });
    }
}
// ---------------------------------------------------------------------------
// GET /api/shadow/divergences
// Top divergent cases (decision differs). Query: limit (default 20)
// ---------------------------------------------------------------------------
export async function getTopDivergences(req, res) {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const divergences = await ShadowComparisonRepo.getTopDivergences(limit);
        res.json({ count: divergences.length, data: divergences });
    }
    catch (error) {
        log.error("[Shadow API] Divergences error:", error);
        res.status(500).json({ error: "Failed to get divergences" });
    }
}
//# sourceMappingURL=shadow.api.js.map