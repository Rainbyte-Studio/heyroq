import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const index = resolve(root, 'index.html');
await stat(index);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const assetInfo = path => stat(path).catch(error => {
  if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
});

createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  let file = resolve(root, '.' + pathname);
  if ((file !== root && !file.startsWith(root + sep)) || pathname.split('/').some(segment => segment.startsWith('.'))) {
    response.writeHead(404).end();
    return;
  }
  try {
    let info = await assetInfo(file);
    if (!info?.isFile() && !extname(pathname) && !pathname.startsWith('/assets/')) {
      file = index;
      info = await stat(file);
    }
    if (!info?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': /^\/assets\/.+-[\w-]{8,}\.[\w]+$/.test(pathname)
        ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(500).end();
  }
}).listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
