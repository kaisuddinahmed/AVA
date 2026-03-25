export declare function createWebhookDelivery(data: {
    sessionId: string;
    siteUrl: string;
    url: string;
}): Promise<{
    status: string;
    id: string;
    siteUrl: string;
    sessionId: string;
    createdAt: Date;
    errorMessage: string | null;
    url: string;
    attempts: number;
    lastAttemptAt: Date | null;
    responseCode: number | null;
}>;
export declare function updateWebhookDelivery(id: string, update: {
    status: string;
    attempts: number;
    lastAttemptAt: Date;
    responseCode?: number;
    errorMessage?: string;
}): Promise<{
    status: string;
    id: string;
    siteUrl: string;
    sessionId: string;
    createdAt: Date;
    errorMessage: string | null;
    url: string;
    attempts: number;
    lastAttemptAt: Date | null;
    responseCode: number | null;
}>;
export declare function getWebhookDeliveryStats(siteUrl: string, since: Date): Promise<{
    total: number;
    delivered: number;
    failed: number;
    pending: number;
    successRate: number;
}>;
export declare function getRecentWebhookDeliveries(siteUrl: string, limit?: number): Promise<{
    status: string;
    id: string;
    siteUrl: string;
    sessionId: string;
    createdAt: Date;
    errorMessage: string | null;
    url: string;
    attempts: number;
    lastAttemptAt: Date | null;
    responseCode: number | null;
}[]>;
//# sourceMappingURL=webhook-delivery.repo.d.ts.map