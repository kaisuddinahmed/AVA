import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = new URL('../apps/store', import.meta.url).pathname;
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

// Load .env values into process.env (simple parser, no extra deps)
function loadDotEnv() {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const storePort = Number.parseInt(process.env.STORE_PORT ?? '3001', 10);
const storeHost = process.env.STORE_HOST ?? '127.0.0.1';

const srv = http.createServer((req, res) => {
  let p = req.url === '/' ? '/index.html' : req.url;
  p = p.split('?')[0];
  const fp = path.join(base, p);
  if (!fs.existsSync(fp)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(fp);
  const contentType = mimeTypes[ext] || 'text/plain';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(fp).pipe(res);
});

srv.listen(storePort, storeHost, () =>
  console.log(`[store] Static server on http://${storeHost}:${storePort}`)
);
