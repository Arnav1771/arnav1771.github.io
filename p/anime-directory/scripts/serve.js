// serve.js — tiny zero-dependency static file server for local dev / QA.
// Usage: PORT=3003 node scripts/serve.js
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = Number(process.env.PORT) || 3003;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * True only when `full` is ROOT itself or lives beneath it.
 * A bare `startsWith(ROOT)` also matched sibling directories that merely share
 * the prefix (e.g. `<root>-secrets/`), so the separator is required.
 */
export function isInsideRoot(full, root = ROOT) {
  return full === root || full.startsWith(root.endsWith(sep) ? root : root + sep);
}

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
    if (path === '/') path = '/index.html';
    // Prevent path traversal.
    const full = normalize(join(ROOT, path));
    if (!isInsideRoot(full)) { res.writeHead(403).end('Forbidden'); return; }

    let target = full;
    try {
      const s = await stat(full);
      if (s.isDirectory()) target = join(full, 'index.html');
    } catch { /* fall through to read error */ }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      // Dev server: never let a stale asset survive a rebuild or a QA re-run.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
  }
});

// Only bind a port when this file is the entry point, so tests can import
// `isInsideRoot` without starting a listener.
if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  server.listen(PORT, () => console.log(`Anime Directory serving on http://localhost:${PORT}`));
}

export { server, ROOT, TYPES };
