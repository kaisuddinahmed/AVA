"use strict";
// ============================================================================
// RetrainTrigger Repository — automated retraining decision tracking
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTrigger = createTrigger;
exports.updateTrigger = updateTrigger;
exports.getLastTrigger = getLastTrigger;
exports.listTriggers = listTriggers;
exports.getActiveTrigger = getActiveTrigger;
const client_js_1 = require("../client.js");
async function createTrigger(data) {
    return client_js_1.prisma.retrainTrigger.create({ data });
}
async function updateTrigger(id, data) {
    return client_js_1.prisma.retrainTrigger.update({ where: { id }, data });
}
async function getLastTrigger() {
    return client_js_1.prisma.retrainTrigger.findFirst({
        orderBy: { triggeredAt: "desc" },
    });
}
async function listTriggers(options) {
    return client_js_1.prisma.retrainTrigger.findMany({
        orderBy: { triggeredAt: "desc" },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
    });
}
async function getActiveTrigger() {
    return client_js_1.prisma.retrainTrigger.findFirst({
        where: {
            status: { notIn: ["completed", "failed"] },
        },
        orderBy: { triggeredAt: "desc" },
    });
}
//# sourceMappingURL=retrain-trigger.repo.js.map