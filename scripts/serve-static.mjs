/**
 * Generic SPA static file server.
 * Usage: node scripts/serve-static.mjs <dist-dir> <port> [host]
 *
 * Falls back to index.html for unknown paths (SPA routing support).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [,, distArg, portArg, hostArg] = process.argv;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(scriptDir, '..', distArg);
const port = Number.parseInt(portArg, 10);
const host = hostArg ?? '0.0.0.0';

if (!distArg || !portArg || isNaN(port)) {
  console.error('Usage: node scripts/serve-static.mjs <dist-dir> <port> [host]');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

const srv = http.createServer((req, res) => {
  let urlPath = req.url?.split('?')[0] ?? '/';
  if (urlPath === '/') urlPath = '/index.html';

  let fp = path.join(base, urlPath);

  // SPA fallback — serve index.html for any path that doesn't resolve to a file
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    fp = path.join(base, 'index.html');
  }

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
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(fp).pipe(res);
});

srv.listen(port, host, () =>
  console.log(`[static] Serving ${distArg} on http://${host}:${port}`)
);
