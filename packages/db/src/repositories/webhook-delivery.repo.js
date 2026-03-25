"use strict";
// ============================================================================
// WebhookDelivery Repository — session-exit webhook delivery tracking
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhookDelivery = createWebhookDelivery;
exports.updateWebhookDelivery = updateWebhookDelivery;
exports.getWebhookDeliveryStats = getWebhookDeliveryStats;
exports.getRecentWebhookDeliveries = getRecentWebhookDeliveries;
const client_js_1 = require("../client.js");
async function createWebhookDelivery(data) {
    return client_js_1.prisma.webhookDelivery.create({ data });
}
async function updateWebhookDelivery(id, update) {
    return client_js_1.prisma.webhookDelivery.update({ where: { id }, data: update });
}
async function getWebhookDeliveryStats(siteUrl, since) {
    const [total, delivered, failed] = await Promise.all([
        client_js_1.prisma.webhookDelivery.count({ where: { siteUrl, createdAt: { gte: since } } }),
        client_js_1.prisma.webhookDelivery.count({ where: { siteUrl, status: "delivered", createdAt: { gte: since } } }),
        client_js_1.prisma.webhookDelivery.count({ where: { siteUrl, status: "failed", createdAt: { gte: since } } }),
    ]);
    const pending = await client_js_1.prisma.webhookDelivery.count({
        where: { siteUrl, status: "pending" },
    });
    return { total, delivered, failed, pending, successRate: total > 0 ? delivered / total : 0 };
}
async function getRecentWebhookDeliveries(siteUrl, limit = 20) {
    return client_js_1.prisma.webhookDelivery.findMany({
        where: { siteUrl },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
//# sourceMappingURL=webhook-delivery.repo.js.map