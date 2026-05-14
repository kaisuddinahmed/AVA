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
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;
const CONFIG_FILE = path.join(__dirname, 'store-config.json');
const ADMIN_HTML  = path.join(__dirname, 'admin.html');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

  // POST /api/upload → save base64 image to disk
  if (method === 'POST' && pathname === '/api/upload') {
    try {
      const data = await body(req);
      if (!data.base64Data || !data.filename) {
        json(res, 400, { error: 'Missing base64Data or filename' });
        return;
      }

      // Decode base64 and save
      const base64Str = data.base64Data.split(',').pop(); // remove data:image/png;base64, prefix if present
      const buffer = Buffer.from(base64Str, 'base64');
      const ext = path.extname(data.filename) || '.png';
      const filename = `img-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filepath, buffer);
      json(res, 200, { ok: true, path: `/uploads/${filename}` });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // GET /uploads/* → serve uploaded images
  if (method === 'GET' && pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) {
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeTypes[ext] || 'image/png';
      res.writeHead(200, { ...CORS, 'Content-Type': mimeType });
      res.end(fs.readFileSync(filepath));
    } else {
      res.writeHead(404, CORS);
      res.end('Not found');
    }
    return;
  }

  // GET /api/products/export → export products as CSV
  if (method === 'GET' && pathname === '/api/products/export') {
    try {
      const config = readConfig();
      const overrides = config.productOverrides || {};

      // CSV headers
      const headers = [
        'product_id',
        'name',
        'price',
        'description',
        'category',
        'image',
        'colors',
        'sizes',
        'stock',
        'specs',
        'return_policy',
        'size_guide_url',
        'active'
      ];

      // Helper to escape CSV values
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV rows
      let csv = headers.join(',') + '\n';
      for (const [productId, override] of Object.entries(overrides)) {
        const row = [
          escapeCsv(productId),
          escapeCsv(override.name || ''),
          escapeCsv(override.price || ''),
          escapeCsv(override.description || ''),
          escapeCsv(override.category || ''),
          escapeCsv(override.image || ''),
          escapeCsv(Array.isArray(override.colors) ? override.colors.join(';') : ''),
          escapeCsv(Array.isArray(override.sizes) ? override.sizes.join(';') : ''),
          escapeCsv(override.stock !== undefined ? override.stock : ''),
          escapeCsv(Array.isArray(override.specs) ? override.specs.join(';') : ''),
          escapeCsv(override.returnPolicy || ''),
          escapeCsv(override.sizeGuideUrl || ''),
          escapeCsv(override.active !== undefined ? override.active : '')
        ];
        csv += row.join(',') + '\n';
      }

      res.writeHead(200, {
        ...CORS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ava-products-${Date.now()}.csv"`
      });
      res.end(csv);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // GET /api/products/export-xlsx → export products as CSV (opens in Excel)
  if (method === 'GET' && pathname === '/api/products/export-xlsx') {
    try {
      const config = readConfig();
      const overrides = config.productOverrides || {};

      // CSV headers
      const headers = ['product_id', 'name', 'price', 'description', 'category', 'image', 'colors', 'sizes', 'stock', 'specs', 'return_policy', 'size_guide_url', 'active'];

      // Helper to escape CSV values
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV rows
      let csv = headers.join(',') + '\n';
      for (const [productId, override] of Object.entries(overrides)) {
        const row = [
          escapeCsv(productId),
          escapeCsv(override.name || ''),
          escapeCsv(override.price || ''),
          escapeCsv(override.description || ''),
          escapeCsv(override.category || ''),
          escapeCsv(override.image || ''),
          escapeCsv(Array.isArray(override.colors) ? override.colors.join(';') : ''),
          escapeCsv(Array.isArray(override.sizes) ? override.sizes.join(';') : ''),
          escapeCsv(override.stock !== undefined ? override.stock : ''),
          escapeCsv(Array.isArray(override.specs) ? override.specs.join(';') : ''),
          escapeCsv(override.returnPolicy || ''),
          escapeCsv(override.sizeGuideUrl || ''),
          escapeCsv(override.active !== undefined ? override.active : '')
        ];
        csv += row.join(',') + '\n';
      }

      // Send as CSV (Excel will open it fine)
      res.writeHead(200, {
        ...CORS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ava-products-${new Date().toISOString().split('T')[0]}.csv"`
      });
      res.end(csv);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // POST /api/products/import → import products from CSV
  if (method === 'POST' && pathname === '/api/products/import') {
    try {
      let raw = '';
      req.on('data', chunk => (raw += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const csvContent = data.csv;

          if (!csvContent) {
            json(res, 400, { error: 'Missing csv content' });
            return;
          }

          // Parse CSV
          const lines = csvContent.trim().split('\n');
          if (lines.length < 2) {
            json(res, 400, { error: 'CSV must have header row and at least one data row' });
            return;
          }

          // Parse header
          const headers = lines[0].split(',').map(h => h.trim());
          const productIdIdx = headers.indexOf('product_id');
          if (productIdIdx === -1) {
            json(res, 400, { error: 'CSV must include product_id column' });
            return;
          }

          // Parse rows
          const config = readConfig();
          const updates = {};

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple CSV parsing (handles basic quoted values)
            const row = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              if (char === '"') inQuotes = !inQuotes;
              else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            row.push(current.trim());

            // Build override object
            const productId = row[productIdIdx];
            if (!productId) continue;

            const override = {};
            for (let j = 0; j < headers.length; j++) {
              const header = headers[j];
              const value = row[j];

              if (header === 'product_id') continue;
              if (!value && value !== '0' && value !== 'false') continue;

              // Parse special fields
              if (header === 'colors' || header === 'sizes') {
                override[header] = value.split(';').filter(v => v.trim());
              } else if (header === 'specs') {
                override[header] = value.split(';').filter(v => v.trim());
              } else if (header === 'stock') {
                override[header] = parseInt(value, 10);
              } else if (header === 'price') {
                override[header] = parseFloat(value);
              } else if (header === 'active') {
                override[header] = value.toLowerCase() === 'true';
              } else if (header === 'sizeGuideUrl') {
                override[header] = value;
              } else if (header === 'size_guide_url') {
                // Map CSV column to camelCase
                override.sizeGuideUrl = value;
              } else if (header === 'return_policy') {
                override.returnPolicy = value;
              } else {
                override[header] = value;
              }
            }

            updates[productId] = override;
          }

          // Merge with existing overrides
          config.productOverrides = { ...config.productOverrides, ...updates };
          writeConfig(config);

          json(res, 200, { ok: true, imported: Object.keys(updates).length });
        } catch (e) {
          json(res, 400, { error: e.message });
        }
      });
      req.on('error', (e) => json(res, 400, { error: e.message }));
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
