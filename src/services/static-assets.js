import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

// The two stylesheets plus the browser scripts are ~116 KB and there is no build
// step to pre-compress them, so the largest files are gzipped once in memory and
// re-read only when their mtime changes.
export function compressedAssets() {
  const cache = new Map();
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!/\bgzip\b/.test(req.get('accept-encoding') || '')) return next();
    let relative;
    try { relative = decodeURIComponent(req.path); } catch { return next(); }
    if (relative === '/' || !path.extname(relative)) relative = '/index.html';
    if (relative.includes('..') || relative.includes('\0')) return next();
    const extension = path.extname(relative).toLowerCase();
    if (!types.has(extension)) return next();
    const file = path.join(publicDir, relative);
    if (!file.startsWith(publicDir + path.sep)) return next();
    let entry;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) return next();
      entry = cache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs) {
        const raw = fs.readFileSync(file);
        entry = {
          mtimeMs: stat.mtimeMs,
          gzip: zlib.gzipSync(raw, { level: 9 }),
          etag: `"${createHash('sha1').update(raw).digest('base64url')}"`
        };
        cache.set(file, entry);
      }
    } catch {
      return next();
    }
    res.setHeader('Content-Type', types.get(extension));
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', entry.etag);
    if (req.get('if-none-match') === entry.etag) return res.status(304).end();
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', String(entry.gzip.length));
    if (req.method === 'HEAD') return res.status(200).end();
    res.status(200).end(entry.gzip);
  };
}
