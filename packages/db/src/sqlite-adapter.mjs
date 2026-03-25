/**
 * Prisma WASM driver adapter for node:sqlite (Node.js 22 built-in).
 */
import { DatabaseSync } from 'node:sqlite';

const ok = (value) => ({
  ok: true, value,
  map: (fn) => ok(fn(value)),
  flatMap: (fn) => fn(value),
});
const err = (message) => ({
  ok: false,
  error: { kind: 'Sqlite', message: String(message), extendedCode: 0 },
  map: () => err(message),
  flatMap: () => err(message),
});

/** node:sqlite can't bind JS booleans or BigInt directly */
function coerceArg(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  return v;
}

function inferColumnType(value) {
  if (value === null || value === undefined) return 7;
  if (typeof value === 'bigint') return 1;
  if (typeof value === 'number') return Number.isInteger(value) ? 0 : 3;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return 13;
  return 7;
}

function execQuery(db, sql, args) {
  try {
    const coerced = (args || []).map(coerceArg);
    const rows = db.prepare(sql).all(...coerced);
    if (!rows.length) return ok({ columnNames: [], columnTypes: [], rows: [] });
    const columnNames = Object.keys(rows[0]);
    const columnTypes = columnNames.map((col) => inferColumnType(rows[0][col]));
    return ok({ columnNames, columnTypes, rows: rows.map(r => columnNames.map(c => r[c])) });
  } catch (e) {
    return err(e.message);
  }
}

function execStatement(db, sql, args) {
  try {
    const coerced = (args || []).map(coerceArg);
    const info = db.prepare(sql).run(...coerced);
    return ok(info.changes ?? 0);
  } catch (e) {
    return err(e.message);
  }
}

class SqliteTransaction {
  constructor(db) {
    this._db = db;
    this.provider = 'sqlite';
    this.adapterName = '@ava/node-sqlite';
    this.connectionInfo = { schemaName: undefined };
  }
  async queryRaw(params) { return execQuery(this._db, params.sql, params.args); }
  async executeRaw(params) { return execStatement(this._db, params.sql, params.args); }
  async commit() {
    try { this._db.exec('COMMIT;'); return ok(undefined); }
    catch (e) { return err(e.message); }
  }
  async rollback() {
    try { this._db.exec('ROLLBACK;'); return ok(undefined); }
    catch (e) { return err(e.message); }
  }
}

class SqliteTransactionContext {
  constructor(db) {
    this._db = db;
    this.provider = 'sqlite';
    this.adapterName = '@ava/node-sqlite';
    this.connectionInfo = { schemaName: undefined };
  }
  async queryRaw(params) { return execQuery(this._db, params.sql, params.args); }
  async executeRaw(params) { return execStatement(this._db, params.sql, params.args); }
  async startTransaction() {
    try { this._db.exec('BEGIN;'); return ok(new SqliteTransaction(this._db)); }
    catch (e) { return err(e.message); }
  }
}

export class NodeSqliteAdapter {
  constructor(dbPath) {
    this._db = new DatabaseSync(dbPath);
    this._db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    this.provider = 'sqlite';
    this.adapterName = '@ava/node-sqlite';
    this.connectionInfo = { schemaName: undefined };
  }
  async queryRaw(params) { return execQuery(this._db, params.sql, params.args); }
  async executeRaw(params) { return execStatement(this._db, params.sql, params.args); }
  async transactionContext() { return ok(new SqliteTransactionContext(this._db)); }
  getConnectionInfo() { return ok({ schemaName: undefined }); }
  close() { try { this._db.close(); } catch {} }
}
