'use strict';
// Zero-dependency static server for the site (public/ + media/) with SPA fallback.
// The backend is Supabase, so nothing else needs to run locally.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildManifest } = require('./build-media-manifest');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const MEDIA = path.join(ROOT, 'media');
const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/media/manifest.json') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(buildManifest()));
  }

  const isMedia = pathname.startsWith('/media/');
  const file = isMedia ? safeJoin(MEDIA, pathname.slice('/media/'.length)) : safeJoin(PUBLIC, pathname);
  const serve = (f) => {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(f).pipe(res);
  };

  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return serve(file);
  if (isMedia || path.extname(pathname)) { res.writeHead(404); return res.end('Not found'); }
  serve(path.join(PUBLIC, 'index.html')); // SPA fallback
}).listen(PORT, () => console.log(`Biodiversity Ambassadors site: http://localhost:${PORT}`));
