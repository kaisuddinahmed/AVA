// ============================================================================
// Express app factory — extracted from index.ts so tests can mount the same
// middleware stack via supertest without booting the HTTP/WS servers.
//
// CRITICAL ORDERING:
//   1. cors()
//   2. shopifyWebhooksRouter  — applies raw() per-route, BEFORE json()
//   3. express.json()         — once this runs, req.body is parsed
//   4. requestId + httpLogger
//   5. /api router
//
// Step 2 must precede step 3 or Shopify HMAC verification will fail (the
// handlers compare HMACs over the raw bytes; a parsed body has already been
// reassembled and the comparison falls apart).
// ============================================================================
import express from "express";
import cors from "cors";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { httpLoggerMiddleware } from "./middleware/http-logger.middleware.js";
import { apiRouter } from "./api/routes.js";
import { shopifyWebhooksRouter } from "./api/shopify-webhooks.router.js";
export function createApp() {
    const app = express();
    app.use(cors());
    // Shopify webhook router MUST mount before express.json() — see file header.
    app.use("/api/shopify/webhooks", shopifyWebhooksRouter);
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(httpLoggerMiddleware);
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    });
    app.use("/api", apiRouter);
    return app;
}
//# sourceMappingURL=app.js.map