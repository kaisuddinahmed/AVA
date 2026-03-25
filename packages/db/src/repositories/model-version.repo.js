"use strict";
// ============================================================================
// ModelVersion Repository — fine-tuned model lifecycle management
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createModelVersion = createModelVersion;
exports.getModelVersion = getModelVersion;
exports.getActiveModel = getActiveModel;
exports.promoteModel = promoteModel;
exports.retireModel = retireModel;
exports.updateModelVersion = updateModelVersion;
exports.listModelVersions = listModelVersions;
const client_js_1 = require("../client.js");
async function createModelVersion(data) {
    return client_js_1.prisma.modelVersion.create({ data });
}
async function getModelVersion(id) {
    return client_js_1.prisma.modelVersion.findUnique({ where: { id } });
}
async function getActiveModel(provider) {
    return client_js_1.prisma.modelVersion.findFirst({
        where: { provider, status: "active" },
        orderBy: { promotedAt: "desc" },
    });
}
/**
 * Promote a model version to active. Retires any currently active model
 * for the same provider first. Only one active per provider at a time.
 */
async function promoteModel(id) {
    const target = await client_js_1.prisma.modelVersion.findUnique({ where: { id } });
    if (!target)
        throw new Error(`ModelVersion ${id} not found`);
    // Retire current active for this provider
    const current = await getActiveModel(target.provider);
    if (current && current.id !== id) {
        await client_js_1.prisma.modelVersion.update({
            where: { id: current.id },
            data: { status: "retired", retiredAt: new Date() },
        });
    }
    return client_js_1.prisma.modelVersion.update({
        where: { id },
        data: { status: "active", promotedAt: new Date() },
    });
}
async function retireModel(id) {
    return client_js_1.prisma.modelVersion.update({
        where: { id },
        data: { status: "retired", retiredAt: new Date() },
    });
}
async function updateModelVersion(id, data) {
    return client_js_1.prisma.modelVersion.update({ where: { id }, data });
}
async function listModelVersions(options) {
    const where = {};
    if (options?.provider)
        where.provider = options.provider;
    if (options?.status)
        where.status = options.status;
    return client_js_1.prisma.modelVersion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
    });
}
//# sourceMappingURL=model-version.repo.js.map