"use strict";
// ============================================================================
// JobRun Repository — scheduled/manual job execution tracking
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJobRun = createJobRun;
exports.completeJobRun = completeJobRun;
exports.failJobRun = failJobRun;
exports.getJobRun = getJobRun;
exports.listJobRuns = listJobRuns;
exports.getLastRun = getLastRun;
exports.pruneOldRuns = pruneOldRuns;
const client_js_1 = require("../client.js");
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function createJobRun(data) {
    return client_js_1.prisma.jobRun.create({
        data: {
            jobName: data.jobName,
            triggeredBy: data.triggeredBy ?? "scheduler",
            status: "running",
        },
    });
}
async function completeJobRun(id, summary, durationMs) {
    return client_js_1.prisma.jobRun.update({
        where: { id },
        data: {
            status: "completed",
            completedAt: new Date(),
            summary: JSON.stringify(summary),
            durationMs,
        },
    });
}
async function failJobRun(id, errorMessage, durationMs) {
    return client_js_1.prisma.jobRun.update({
        where: { id },
        data: {
            status: "failed",
            completedAt: new Date(),
            errorMessage,
            durationMs,
        },
    });
}
async function getJobRun(id) {
    return client_js_1.prisma.jobRun.findUnique({ where: { id } });
}
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
async function listJobRuns(options) {
    const where = {};
    if (options?.jobName)
        where.jobName = options.jobName;
    if (options?.status)
        where.status = options.status;
    return client_js_1.prisma.jobRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
    });
}
async function getLastRun(jobName) {
    return client_js_1.prisma.jobRun.findFirst({
        where: { jobName },
        orderBy: { startedAt: "desc" },
    });
}
async function pruneOldRuns(olderThan) {
    return client_js_1.prisma.jobRun.deleteMany({
        where: { startedAt: { lt: olderThan } },
    });
}
//# sourceMappingURL=job-run.repo.js.map