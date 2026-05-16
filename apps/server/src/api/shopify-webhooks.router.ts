// ============================================================================
// Shopify webhook router — mounted BEFORE express.json() in index.ts.
//
// Why a dedicated router?
//   Shopify webhooks must verify HMAC over the *raw* request bytes. If
//   express.json() runs first, req.body is a parsed object and the
//   timing-safe HMAC comparison fails. Splitting these routes into their
//   own router lets us apply express.raw() exclusively, before the global
//   json() middleware ever sees the request.
//
// All routes here apply `raw({ type: "*/*" })` so req.body is a Buffer.
// ============================================================================

import { Router, raw } from "express";
import * as shopifyApi from "./shopify.api.js";
import * as shopifyWebhooks from "./shopify-webhooks.api.js";

export const shopifyWebhooksRouter = Router();

// Mandatory app lifecycle webhook
shopifyWebhooksRouter.post(
  "/uninstall",
  raw({ type: "*/*" }),
  shopifyApi.webhookUninstall,
);

// Mandatory GDPR webhooks (Shopify App Store requirement)
shopifyWebhooksRouter.post(
  "/gdpr/customers/data_request",
  raw({ type: "*/*" }),
  shopifyApi.webhookCustomersDataRequest,
);
shopifyWebhooksRouter.post(
  "/gdpr/customers/redact",
  raw({ type: "*/*" }),
  shopifyApi.webhookCustomersRedact,
);
shopifyWebhooksRouter.post(
  "/gdpr/shop/redact",
  raw({ type: "*/*" }),
  shopifyApi.webhookShopRedact,
);

// Phase 1.3.4 — product lifecycle webhooks
shopifyWebhooksRouter.post(
  "/products/update",
  raw({ type: "*/*" }),
  shopifyWebhooks.webhookProductsUpdate,
);
shopifyWebhooksRouter.post(
  "/products/create",
  raw({ type: "*/*" }),
  shopifyWebhooks.webhookProductsUpdate,
);
shopifyWebhooksRouter.post(
  "/products/delete",
  raw({ type: "*/*" }),
  shopifyWebhooks.webhookProductsDelete,
);
