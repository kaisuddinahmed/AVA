// @ts-nocheck
// ============================================================================
// Prisma Client — WASM + node:sqlite adapter (linux-arm64 compat)
// Bypasses the native binary engine which is not available on linux-arm64.
// ============================================================================
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import { DatabaseSync } from "node:sqlite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ok = (value) => ({ ok: true, value, map: (fn) => ok(fn(value)), flatMap: (fn) => fn(value) });
const err = (message, code = 0) => ({ ok: false, error: { kind: "Sqlite", message: String(message), extendedCode: code }, map: () => err(message, code), flatMap: () => err(message, code) });
const CT_INT32 = 0, CT_INT64 = 1, CT_DOUBLE = 3, CT_BOOLEAN = 5, CT_TEXT = 7, CT_DATETIME = 10, CT_JSON = 11;
function inferColumnType(v) {
    if (v === null || v === undefined)
        return CT_TEXT;
    if (typeof v === "boolean")
        return CT_BOOLEAN;
    if (typeof v === "bigint")
        return CT_INT64;
    if (typeof v === "number")
        return Number.isInteger(v) ? CT_INT32 : CT_DOUBLE;
    if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v))
            return CT_DATETIME;
        if ((v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]")))
            return CT_JSON;
        return CT_TEXT;
    }
    return CT_TEXT;
}
function coerceArg(v) {
    if (v === true)
        return 1;
    if (v === false)
        return 0;
    if (typeof v === "bigint")
        return Number(v);
    if (v instanceof Date)
        return v.toISOString();
    return v;
}
class NodeSqliteAdapter {
    constructor(db) {
        this.db = db;
        this.provider = "sqlite";
        this.adapterName = "node-sqlite";
        this.errorRegistry = {};
    }
    async queryRaw(query) {
        try {
            const args = (query.args || []).map(coerceArg);
            const stmt = this.db.prepare(query.sql);
            const rows = stmt.all(...args);
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            const firstRow = rows[0] || {};
            const columnTypes = columns.map((c) => inferColumnType(firstRow[c]));
            return ok({ columnNames: columns, columnTypes, rows: rows.map((r) => columns.map((c) => r[c])) });
        }
        catch (e) {
            return err(e.message);
        }
    }
    async executeRaw(query) {
        try {
            const args = (query.args || []).map(coerceArg);
            const stmt = this.db.prepare(query.sql);
            const result = stmt.run(...args);
            return ok(result.changes ?? 0);
        }
        catch (e) {
            return err(e.message);
        }
    }
    async transactionContext() {
        const db = this.db;
        const adapter = this;
        // Prisma WASM's fa() reads adapterName/provider from the context object itself
        return ok({
            adapterName: "node-sqlite",
            provider: "sqlite",
            async startTransaction() {
                try {
                    db.exec("BEGIN");
                    return ok({
                        adapterName: "node-sqlite",
                        provider: "sqlite",
                        options: {},
                        async executeRaw(q) { return adapter.executeRaw(q); },
                        async queryRaw(q) { return adapter.queryRaw(q); },
                        async commit() {
                            try {
                                db.exec("COMMIT");
                                return ok(undefined);
                            }
                            catch (e) {
                                return err(e.message);
                            }
                        },
                        async rollback() {
                            try {
                                db.exec("ROLLBACK");
                            }
                            catch { }
                            return ok(undefined);
                        },
                    });
                }
                catch (e) {
                    return err(e.message);
                }
            },
            async executeRaw(q) { return adapter.executeRaw(q); },
            async queryRaw(q) { return adapter.queryRaw(q); },
        });
    }
}
function resolveDbPath() {
    const url = process.env.DATABASE_URL || "file:/tmp/ava-dev.db";
    const raw = url.replace(/^file:/, "");
    if (raw.startsWith("/"))
        return raw;
    return path.resolve(__dirname, "..", raw);
}
const DB_PATH = resolveDbPath();
const _require = createRequire(import.meta.url);
const wasmClientPath = path.resolve(__dirname, "../../../node_modules/.prisma/client/index-wasm.js");
const { PrismaClient } = _require(wasmClientPath);
function makePrisma() {
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA foreign_keys=ON;");
    return new PrismaClient({ adapter: new NodeSqliteAdapter(db), log: [] });
}
const globalForPrisma = globalThis;
if (!globalForPrisma.__ava_prisma) {
    globalForPrisma.__ava_prisma = makePrisma();
}
export const prisma = globalForPrisma.__ava_prisma;
export { PrismaClient };
export default prisma;
//# sourceMappingURL=client.js.map