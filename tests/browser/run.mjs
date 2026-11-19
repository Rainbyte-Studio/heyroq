import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const projectId = 'demo-heyroq';
const storageBucket = 'demo-heyroq.appspot.com';
const databaseId = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const hosts = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const [key, address] of Object.entries(hosts)) assert.equal(process.env[key], address, key);

const app = initializeApp({ projectId, storageBucket });
const db = getFirestore(app, databaseId);
const bucket = getStorage(app).bucket();
const origin = 'http://127.0.0.1:4173';
const imagePrefix = '/v0/b/' + storageBucket + '/o/';
const imageOrigin = 'https://firebasestorage.googleapis.com';
const localStorage = 'http://' + hosts.FIREBASE_STORAGE_EMULATOR_HOST;
const allowed = new Set([origin, 'http://127.0.0.1:5001', ...Object.values(hosts).map(host => 'http://' + host)]);
const unexpected = new Set();
const png = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64')];

function objectFor(raw) {
  const url = new URL(raw);
  assert.equal(url.origin, imageOrigin);
  assert.ok(url.pathname.startsWith(imagePrefix));
  return bucket.file(decodeURIComponent(url.pathname.slice(imagePrefix.length)));
}

async function waitForRemoval(file) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (!(await file.exists())[0]) return;
    await delay(250);
  }
  assert.fail('Storage cleanup did not remove ' + file.name);
}

const outDir = await mkdtemp(join(tmpdir(), 'heyroq-browser-'));
let browser;
let server;
try {
  await build({ mode: 'browser-emulator', build: { outDir, rollupOptions: { input: 'tests/browser/index.html' } } });
  server = await preview({ mode: 'browser-emulator', build: { outDir }, preview: {
    host: '127.0.0.1', port: 4173, strictPort: true,
  } });
  browser = await chromium.launch({
    executablePath: process.env.HEYROQ_CHROMIUM_EXECUTABLE,
    args: [
      '--proxy-server=http://127.0.0.1:1',
      '--disable-background-networking',
      '--disable-quic',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.routeWebSocket(/.*/, async socket => {
    unexpected.add(new URL(socket.url()).origin);
    await socket.close();
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (allowed.has(url.origin)) return route.continue();
    if (url.origin === imageOrigin && url.pathname.startsWith(imagePrefix) && route.request().method() === 'GET') {
      const response = await fetch(localStorage + url.pathname + url.search, { redirect: 'error' });
      // Only proxy the disposable bucket to loopback. Never follow a redirect.
      return route.fulfill({
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        body: Buffer.from(await response.arrayBuffer()),
        headers: { 'access-control-allow-origin': origin },
      });
    }
    unexpected.add(url.origin);
    return route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  await page.goto(origin + '/tests/browser/index.html');
  await page.waitForFunction(() => Boolean(window.heyroqTest));
  const read = url => page.evaluate(async source => {
    const response = await fetch(source);
    return { status: response.status, bytes: response.ok ? [...new Uint8Array(await response.arrayBuffer())] : [] };
  }, url);
  const uid = await page.evaluate(async id => window.heyroqTest.signUp(id + '@example.test', id), randomUUID());
  const profile = db.collection('users').doc(uid);
  await profile.set({ displayName: 'Browser fixture' });
  const legacyPath = 'pins/' + uid + '/legacy.png';
  await bucket.file(legacyPath).save(Buffer.from(png), { resumable: false, contentType: 'image/png' });
  assert.deepEqual(await page.evaluate(path => window.heyroqTest.legacy(path), legacyPath), png);

  const { pinId, retry, urls } = await page.evaluate(args => window.heyroqTest.publish(...args), [uid, png]);
  assert.equal(retry, pinId);
  assert.equal(urls.length, 1);
  assert.deepEqual(await read(urls[0]), { status: 200, bytes: png });
  const invalid = new URL(urls[0]);
  invalid.searchParams.delete('token');
  assert.equal((await read(invalid.href)).status, 403);
  invalid.searchParams.set('token', randomUUID());
  assert.equal((await read(invalid.href)).status, 403);

  const avatar = () => page.evaluate(args => window.heyroqTest.avatar(...args), [uid, png]);
  const oldAvatar = await avatar();
  assert.deepEqual(await read(oldAvatar), { status: 200, bytes: png });
  const oldObject = objectFor(oldAvatar);
  assert.equal(new URL(oldAvatar).hash, '#generation=' + (await oldObject.getMetadata())[0].generation);
  const newAvatar = await avatar();
  assert.notEqual(oldAvatar, newAvatar);
  await waitForRemoval(oldObject);
  assert.equal((await profile.get()).get('photoURL'), newAvatar);
  assert.deepEqual(await read(newAvatar), { status: 200, bytes: png });

  assert.equal(await page.evaluate(args => window.heyroqTest.removePin(...args), [pinId, uid]), false);
  await waitForRemoval(objectFor(urls[0]));
  assert.deepEqual(await page.evaluate(() => window.heyroqTest.deleteAccount()), ['deleting', 'deleting']);
  assert.equal((await db.collection('accountDeletionLocks').doc(uid).get()).get('status'), 'deleting');
  assert.deepEqual([...unexpected], [], 'Unexpected browser network origins');
  console.log('Browser passed: legacy/managed delivery, token checks, publish and delete retries, avatar cleanup, account deletion intake.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await db.terminate();
  await rm(outDir, { recursive: true, force: true });
}
