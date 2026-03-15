// ============================================================================
// WebhookDelivery Repository — session-exit webhook delivery tracking
// ============================================================================

import { prisma } from "../client.js";

export async function createWebhookDelivery(data: {
  sessionId: string;
  siteUrl: string;
  url: string;
}) {
  return prisma.webhookDelivery.create({ data });
}

export async function updateWebhookDelivery(
  id: string,
  update: {
    status: string;
    attempts: number;
    lastAttemptAt: Date;
    responseCode?: number;
    errorMessage?: string;
  }
) {
  return prisma.webhookDelivery.update({ where: { id }, data: update });
}

export async function getWebhookDeliveryStats(siteUrl: string, since: Date) {
  const [total, delivered, failed] = await Promise.all([
    prisma.webhookDelivery.count({ where: { siteUrl, createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { siteUrl, status: "delivered", createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { siteUrl, status: "failed", createdAt: { gte: since } } }),
  ]);
  const pending = await prisma.webhookDelivery.count({
    where: { siteUrl, status: "pending" },
  });
  return { total, delivered, failed, pending, successRate: total > 0 ? delivered / total : 0 };
}

export async function getRecentWebhookDeliveries(siteUrl: string, limit = 20) {
  return prisma.webhookDelivery.findMany({
    where: { siteUrl },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
