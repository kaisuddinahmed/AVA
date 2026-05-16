// ============================================================================
// WooCommerce webhook router — mounted BEFORE express.json() in app.ts.
//
// Same discipline as shopify-webhooks.router.ts: Woo signs the raw bytes,
// so the JSON middleware can't be allowed to consume req.body first. Each
// route applies its own raw() so req.body is a Buffer.
// ============================================================================
import { Router, raw } from "express";
import * as wooWebhooks from "./woocommerce-webhooks.api.js";
export const woocommerceWebhooksRouter = Router();
woocommerceWebhooksRouter.post("/products/update", raw({ type: "*/*" }), wooWebhooks.webhookProductsUpdate);
woocommerceWebhooksRouter.post("/products/create", raw({ type: "*/*" }), wooWebhooks.webhookProductsUpdate);
woocommerceWebhooksRouter.post("/products/delete", raw({ type: "*/*" }), wooWebhooks.webhookProductsDelete);
//# sourceMappingURL=woocommerce-webhooks.router.js.map