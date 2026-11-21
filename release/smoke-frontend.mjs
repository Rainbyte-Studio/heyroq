import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const origin = new URL(process.argv[2]);
assert.equal(origin.hostname, '127.0.0.1');
const request = (path, options) => fetch(new URL(path, origin), { redirect: 'error', ...options });
let home;
for (let attempt = 0; attempt < 40; attempt++) {
  home = await request('/').catch(() => undefined);
  if (home?.ok) break;
  await delay(250);
}
assert.equal(home?.status, 200);
assert.equal(home.headers.get('cache-control'), 'no-cache');
const html = await home.text();
for (const path of ['/pins/rollback-smoke', '/settings', '/settings/account', '/settings/notifications', '/notifications', '/activity']) {
  const spa = await request(path);
  assert.equal(spa.status, 200, path);
  assert.equal(await spa.text(), html, path);
}
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
assert.ok(assets.some(path => path.endsWith('.js')));
const stylesheetPath = assets.find(path => path.endsWith('.css'));
assert.ok(stylesheetPath, 'The frontend loads a stylesheet');
const stylesheet = await (await request(stylesheetPath)).text();
const windowHeaderRule = stylesheet.match(/(?:^|[{}])[^{}]*\.heyroq-window-header(?=[\s,{])[^{}]*\{([^{}]*)\}/);
assert.match(windowHeaderRule?.[1] ?? '', /(?:^|;)\s*backdrop-filter\s*:\s*blur\(/,
  'The production stylesheet preserves the standard window header backdrop blur');
for (const asset of assets) {
  const res = await request(asset, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /immutable/);
  assert.ok(Number(res.headers.get('content-length')) > 0);
}
assert.equal((await request('/assets/missing.js')).status, 404);
assert.equal((await request('/.env')).status, 404);
assert.equal((await request('/', { method: 'POST' })).status, 405);
console.log('Frontend package passed: SPA routing, assets, caching, and HTTP methods.');
