/**
 * AVA Admin Server — port 3003
 * Uses only Node.js built-ins (no npm install needed).
 * Serves admin.html and exposes REST API for store-config.json.
 *
 * Run: node admin-server.js
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;
const CONFIG_FILE = path.join(__dirname, 'store-config.json');
const ADMIN_HTML  = path.join(__dirname, 'admin.html');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res, status, data) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  // CORS pre-flight
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // GET / → serve admin.html
  if (method === 'GET' && pathname === '/') {
    try {
      const html = fs.readFileSync(ADMIN_HTML, 'utf8');
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, CORS);
      res.end('admin.html not found');
    }
    return;
  }

  // GET /api/config → return full config JSON
  if (method === 'GET' && pathname === '/api/config') {
    json(res, 200, readConfig());
    return;
  }

  // POST /api/config → overwrite full config
  if (method === 'POST' && pathname === '/api/config') {
    try {
      const data = await body(req);
      writeConfig(data);
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // PATCH /api/config/:section → update one top-level key
  const patchMatch = pathname.match(/^\/api\/config\/(\w+)$/);
  if (method === 'POST' && patchMatch) {
    const section = patchMatch[1];
    try {
      const update = await body(req);
      const config = readConfig();
      config[section] = update;
      writeConfig(config);
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  res.writeHead(404, CORS);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  AVA Admin Panel → http://localhost:${PORT}`);
  console.log(`  Store           → http://localhost:3001\n`);
});
