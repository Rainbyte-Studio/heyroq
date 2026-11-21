import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
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
let failAvatarDelivery = false;
const png = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64')];

function objectFor(raw) {
  const url = new URL(raw);
  assert.equal(url.origin, imageOrigin);
  assert.ok(url.pathname.startsWith(imagePrefix));
  return bucket.file(decodeURIComponent(url.pathname.slice(imagePrefix.length)));
}

function managedObject(uid, raw) {
  const url = new URL(raw);
  assert.equal(url.pathname, '/publicPinImageV1');
  return bucket.file(['pin-images-v2', uid, url.searchParams.get('pin'),
    url.searchParams.get('incarnation'), url.searchParams.get('image')].join('/'));
}

async function waitForRemoval(file) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (!(await file.exists())[0]) return;
    await delay(250);
  }
  assert.fail('Storage cleanup did not remove ' + file.name);
}

const outDir = await mkdtemp(joinPath(tmpdir(), 'heyroq-browser-'));
let browser;
let server;
try {
  await db.doc('progressionMaintenance/writers').set({ schemaVersion: 1, mode: 'running', generation: 'progressionV11', progressionStartsAtMs: 1 });
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
  async function isolatedContext() {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.routeWebSocket(/.*/, async socket => {
    unexpected.add(new URL(socket.url()).origin);
    await socket.close();
    });
    await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (allowed.has(url.origin)) return route.continue();
    if (url.origin === 'https://europe-west2-demo-heyroq.cloudfunctions.net' &&
        url.pathname === '/publicPinImageV1' && route.request().method() === 'GET') {
      const response = await fetch('http://127.0.0.1:5001/demo-heyroq/europe-west2/publicPinImageV1' + url.search, { redirect: 'error' });
      return route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        headers: { 'access-control-allow-origin': origin, 'cache-control': 'private, no-store' } });
    }
    if (url.origin === imageOrigin && url.pathname.startsWith(imagePrefix) && route.request().method() === 'GET') {
      if (failAvatarDelivery && decodeURIComponent(url.pathname).includes('/profile-images/')) {
        return route.fulfill({ status: 503, body: '' });
      }
      const response = await fetch(localStorage + url.pathname + url.search, { redirect: 'error' });
      // Only proxy the disposable bucket to loopback. Never follow a redirect.
      return route.fulfill({
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        body: Buffer.from(await response.arrayBuffer()),
        headers: { 'access-control-allow-origin': origin },
      });
    }
    unexpected.add(url.origin + url.pathname);
    return route.abort('blockedbyclient');
    });
    return context;
  }
  const context = await isolatedContext();

  const page = await context.newPage();
  await page.goto(origin + '/tests/browser/index.html');
  await page.waitForFunction(() => Boolean(window.heyroqTest));
  const read = url => page.evaluate(async source => {
    const response = await fetch(source);
    return { status: response.status, bytes: response.ok ? [...new Uint8Array(await response.arrayBuffer())] : [] };
  }, url);
  const uid = await page.evaluate(async id => window.heyroqTest.signUp(id + '@example.test', id), randomUUID());
  const profile = db.collection('users').doc(uid);
  await db.doc('usernameRegistryState/v1').set({ ready: true });
  await db.doc('usernames/reserved_test').set({ blocked: true });
  await profile.set({ displayName: 'Browser fixture' });
  await page.evaluate(uid => window.heyroqTest.mountAchievementsTrigger(uid), uid);
  const achievementsTrigger = page.getByRole('button', { name: 'Open Explorer Progression' });
  await achievementsTrigger.press('Enter');
  const modal = page.getByRole('dialog', { name: 'Explorer Progression' });
  const closeAchievements = modal.getByRole('button', { name: 'Close Explorer Progression' });
  const historyButton = modal.getByRole('button', { name: /^Recent Milestone Activity/ });
  const allBadges = modal.getByRole('button', { name: /^All Badges/ });
  const geography = modal.getByRole('button', { name: /^Geography/ });
  const soon = modal.getByText('Coming Soon', { exact: true });
  await soon.first().waitFor();
  assert.ok(await modal.evaluate(dialog => dialog.matches(':modal')));
  assert.ok(await closeAchievements.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await historyButton.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await closeAchievements.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await allBadges.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.ok(await geography.evaluate(button => button === document.activeElement));
  assert.equal(await modal.getByRole('article').count(), 26);
  assert.equal(await soon.count(), 7);
  await page.keyboard.press('Space');
  assert.equal(await geography.getAttribute('aria-pressed'), 'true');
  assert.ok(await geography.evaluate(button => button === document.activeElement));
  await modal.getByText('Geographic Achievements are coming soon.', { exact: false }).waitFor();
  const textContrast = locator => locator.evaluate(text => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const backgrounds = [];
    for (let node = text; node; node = node.parentElement) {
      backgrounds.unshift(getComputedStyle(node).backgroundColor);
    }
    const paint = color => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    };
    const luminance = () => {
      const [red, green, blue] = Array.from(context.getImageData(0, 0, 1, 1).data, value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    paint('white');
    backgrounds.forEach(paint);
    const background = luminance();
    paint(getComputedStyle(text).color);
    const foreground = luminance();
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  const badges = [
    ['Local Explorer', 1, 'bronze', 25], ['Urban Scout', 2, 'bronze', 30],
    ['Metro Nomad', 5, 'silver', 75], ['City Pathfinder', 10, 'gold', 150],
    ['Cross Borders', 2, 'silver', 75], ['World Citizen', 4, 'gold', 150],
    ['Global Voyager', 8, 'platinum', 250],
  ];
  for (const [name, target, tier, xp] of badges) {
    const card = modal.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await card.getByText('Coming Soon', { exact: true }).waitFor();
    assert.equal(await card.getAttribute('aria-labelledby'), await card.getByRole('heading').getAttribute('id'));
    assert.equal(await card.getAttribute('aria-describedby'), await card.getByText('Coming Soon', { exact: true }).getAttribute('id'));
    assert.match(await card.innerText(), new RegExp(`Geography · ${tier}.*\\+${xp} XP.*Goal ${target}`, 'is'));
    assert.equal(await card.locator('[style*="width"]').count(), 0);
  }
  const screenshotDir = process.env.HEYROQ_QA_SCREENSHOTS;
  for (const [width, height, dark] of [[320, 440, false], [375, 667, false], [768, 600, true], [1024, 360, true], [1280, 800, true]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await geography.evaluate(button => button.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await page.waitForFunction(dark => {
      const card = document.querySelector('#achievements-modal article');
      return card && getComputedStyle(card).backgroundColor === (dark ? 'rgb(34, 35, 39)' : 'rgb(255, 255, 255)');
    }, dark);
    const layout = await modal.getByRole('article').evaluateAll(cards => cards.map(card => {
      const { x, right } = card.getBoundingClientRect();
      return { x, right, overflow: card.scrollWidth > card.clientWidth, border: getComputedStyle(card).borderTopStyle };
    }));
    assert.ok(layout.every(card => card.x >= 0 && card.right <= width && !card.overflow && card.border === 'dashed'));
    assert.equal(new Set(layout.map(card => card.x)).size, width < 640 ? 1 : 2);
    const panelFits = await modal.evaluate(dialog => {
      const panel = dialog.firstElementChild;
      const bounds = panel.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight && panel.scrollWidth <= panel.clientWidth;
    });
    assert.ok(panelFits, `the dialog fits at ${width}×${height}`);
    const filtersFit = await modal.getByRole('group', { name: 'Filter badges by category' }).evaluate(group => {
      const bounds = group.getBoundingClientRect();
      return Array.from(group.querySelectorAll('button')).every(button => {
        const item = button.getBoundingClientRect();
        return item.x >= bounds.x && item.right <= bounds.right && item.height >= 44;
      });
    });
    assert.ok(filtersFit, `filters fit at ${width}px`);
    assert.ok(await textContrast(soon.first()) >= 4.5, `Coming Soon text passes at ${width}px`);
    assert.ok(await textContrast(geography) >= 4.5, `selected filter text passes at ${width}px`);
    if (screenshotDir && width !== 768) {
      await page.screenshot({
        path: joinPath(screenshotDir, `geography-${width}-${dark ? 'dark' : 'light'}.png`),
        animations: 'disabled',
      });
    }
  }
  const historical = db.collection('progressionV11').doc(profile.id).collection('achievements').doc('city_scout');
  const history = {
    id: 'city_scout', title: 'Urban Scout', category: 'Geography', iconName: 'Building',
    tier: 'gold', xpReward: 90, isUnlocked: true, progress: 2, target: 2,
    unlockedAt: '2025-01-06T00:00:00Z',
  };
  const legacyProgress = db.collection('progressionV11').doc(profile.id).collection('achievements').doc('city_pathfinder');
  await db.batch().set(historical, history).set(legacyProgress, { progress: 10, isUnlocked: false }).commit();
  const earned = modal.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Urban Scout' }) });
  await earned.getByText('Completed', { exact: true }).waitFor();
  assert.ok(await textContrast(earned.getByText('Completed', { exact: true })) >= 4.5);
  assert.ok(await earned.evaluate(card => document.getElementById(card.getAttribute('aria-describedby'))?.textContent === 'Completed'));
  assert.match(await earned.innerText(), /Geography · gold.*\+90 XP.*2 \/ 2/is);
  assert.equal(await earned.locator('time').getAttribute('datetime'), history.unlockedAt);
  assert.equal(await earned.getByText('Coming Soon', { exact: true }).count(), 0);
  const locked = modal.getByRole('article').filter({ has: page.getByRole('heading', { name: 'City Pathfinder' }) });
  assert.equal(await locked.getByText('10 / 10', { exact: true }).count(), 0);
  assert.equal(await locked.locator('[style*="width"]').count(), 0);
  assert.equal(await page.evaluate(uid => window.heyroqTest.tryWriteVerifiedProgress(uid), uid), 'permission-denied');
  assert.equal(await soon.count(), 6);
  assert.deepEqual((await historical.get()).data(), history);
  assert.deepEqual((await legacyProgress.get()).data(), { progress: 10, isUnlocked: false });
  if (screenshotDir) {
    await page.screenshot({ path: joinPath(screenshotDir, 'geography-historical-dark.png'), animations: 'disabled' });
  }
  await modal.getByRole('button', { name: /^All Badges/ }).click();
  assert.equal(await modal.getByRole('article').count(), 26);
  assert.equal(await modal.getByText('Progress', { exact: true }).count(), 19);
  await historyButton.press('Space');
  assert.equal(await historyButton.getAttribute('aria-expanded'), 'true');
  assert.ok(await historyButton.evaluate(button => button === document.activeElement));
  const historyPanel = modal.locator('div[id$="-history"]');
  assert.equal(await historyButton.getAttribute('aria-controls'), await historyPanel.getAttribute('id'));
  await historyPanel.getByText('No recent XP events recorded yet.').waitFor();
  await historyPanel.evaluate(panel => {
    const action = document.createElement('button');
    action.textContent = 'Fixture history action';
    panel.append(action);
  });
  const historyAction = modal.getByRole('button', { name: 'Fixture history action' });
  await page.keyboard.press('Tab');
  assert.ok(await historyAction.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await closeAchievements.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await historyAction.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  assert.equal(await historyButton.getAttribute('aria-expanded'), 'false');
  assert.ok(await historyButton.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await closeAchievements.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  assert.ok(await achievementsTrigger.evaluate(button => button === document.activeElement));
  await achievementsTrigger.press('Space');
  await closeAchievements.waitFor();
  await page.mouse.click(1, 1);
  await modal.waitFor({ state: 'detached' });
  assert.ok(await achievementsTrigger.evaluate(button => button === document.activeElement));
  await page.evaluate(uid => window.heyroqTest.mountAchievementsTrigger(uid, true), uid);
  const nestedTrigger = page.getByRole('button', { name: 'Open Profile Achievements' });
  const parentDialog = page.getByRole('dialog', { name: 'Fixture profile' });
  await nestedTrigger.press('Enter');
  await closeAchievements.waitFor();
  await page.evaluate(() => {
    const parent = document.querySelector('dialog[aria-label="Fixture profile"]');
    Array.from(parent.querySelectorAll('button')).find(button => button.textContent === 'Open Profile Achievements').remove();
  });
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  assert.ok(await parentDialog.evaluate(dialog => dialog.matches(':modal')));
  const fallback = parentDialog.getByRole('button', { name: 'Close fixture profile' });
  assert.ok(await fallback.evaluate(button => button === document.activeElement));
  await fallback.press('Enter');
  assert.equal(await achievementsTrigger.getAttribute('data-background-escaped'), 'false');
  await achievementsTrigger.press('Enter');
  await closeAchievements.waitFor();
  await page.keyboard.press('Enter');
  await modal.waitFor({ state: 'detached' });
  assert.ok(await achievementsTrigger.evaluate(button => button === document.activeElement));
  console.log('Achievements browser passed: all geography states, historical date and tier, keyboard, themes and responsive grid.');

  await page.evaluate(() => window.heyroqTest.mountCreatePin());
  await page.locator('input[type=file]').setInputFiles({
    name: 'no-exif.png', mimeType: 'image/png', buffer: Buffer.from(png),
  });
  await page.getByLabel('Country', { exact: true }).selectOption('GR');
  await page.getByLabel('Filter cities').fill('Athens');
  await page.getByLabel('City', { exact: true }).selectOption('264371');
  await page.getByRole('button', { name: 'Move pin to city center' }).click();
  assert.deepEqual(await page.locator('#create-pin-form input[type=number]').evaluateAll(
    inputs => inputs.map(input => input.valueAsNumber),
  ), [37.98376, 23.72784]);
  assert.ok(await page.getByText('Geography rewards are paused.', { exact: false }).isVisible());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const legacyPath = 'pins/' + uid + '/legacy.png';
  await bucket.file(legacyPath).save(Buffer.from(png), { resumable: false, contentType: 'image/png' });
  assert.deepEqual(await page.evaluate(path => window.heyroqTest.legacy(path), legacyPath), png);

  const { pinId, retry, urls } = await page.evaluate(args => window.heyroqTest.publish(...args), [uid, png]);
  assert.equal(retry, pinId);
  assert.deepEqual((await db.doc('pins/' + pinId).get()).get('geographySelection'),
    { countryCode: 'GR', cityId: '264371' });
  const xpEvents = db.collection('progressionV11').doc(profile.id).collection('xpEvents');
  for (let attempt = 0; attempt < 80 && !(await xpEvents.doc(`pin_created:${pinId}`).get()).exists; attempt++) {
    await delay(250);
  }
  assert.equal((await xpEvents.doc(`pin_created:${pinId}`).get()).get('action'), 'PIN_CREATED');
  assert.deepEqual((await xpEvents.get()).docs.filter(doc =>
    /^(?:UNIQUE_CITY|UNIQUE_COUNTRY)$/.test(doc.get('action')) || doc.id.startsWith('geo_v1:')), []);
  const geographicAwards = await db.collection('progressionV11').doc(profile.id).collection('achievements').where('category', '==', 'Geography').get();
  assert.deepEqual(geographicAwards.docs.filter(doc => doc.get('isUnlocked')).map(doc => doc.id), ['city_scout']);
  assert.equal(urls.length, 1);
  assert.deepEqual(await read(urls[0]), { status: 200, bytes: png });
  const invalid = new URL(urls[0]);
  invalid.searchParams.delete('image');
  assert.equal((await read(invalid.href)).status, 404);
  invalid.searchParams.set('image', randomUUID());
  assert.equal((await read(invalid.href)).status, 404);

  const avatar = () => page.evaluate(args => window.heyroqTest.avatar(...args), [uid, png]);
  const oldAvatar = await avatar();
  assert.deepEqual(await read(oldAvatar), { status: 200, bytes: png });
  const oldObject = objectFor(oldAvatar);
  assert.equal(new URL(oldAvatar).hash, '#generation=' + (await oldObject.getMetadata())[0].generation);
  failAvatarDelivery = true;
  try {
    await assert.rejects(avatar(), /uploaded photo could not be loaded/);
  } finally {
    failAvatarDelivery = false;
  }
  assert.equal((await profile.get()).get('photoURL'), oldAvatar);
  const newAvatar = await avatar();
  assert.notEqual(oldAvatar, newAvatar);
  await waitForRemoval(oldObject);
  assert.equal((await profile.get()).get('photoURL'), newAvatar);
  assert.deepEqual(await read(newAvatar), { status: 200, bytes: png });

  assert.equal(await page.evaluate(args => window.heyroqTest.removePin(...args), [pinId, uid]), false);
  await waitForRemoval(managedObject(uid, urls[0]));
  assert.equal((await read(urls[0])).status, 404);
  assert.deepEqual(await page.evaluate(() => window.heyroqTest.deleteAccount()), ['deleting', 'deleting']);
  assert.equal((await db.collection('accountDeletionLocks').doc(uid).get()).get('status'), 'deleting');
  const searchPins = db.collection('pins');
  const batch = db.batch();
  for (let i = 0; i < 150; i++) {
    batch.set(searchPins.doc('aa-search-' + String(i).padStart(3, '0')), {
      title: 'Unrelated fixture', visibility: 'public', status: 'published', publicAccess: true,
    });
  }
  const fixture = {
    visibility: 'public', status: 'published', publicAccess: true,
    geohash: await page.evaluate(() => window.heyroqTest.fixtureGeohash()),
    userId: 'search-fixture', userName: 'Search fixture', latitude: 37, longitude: 23,
    category: 'Food', imageUrls: [], likeCount: 0, commentCount: 0, createdAt: new Date().toISOString(),
  };
  batch.set(searchPins.doc('zz-search-tag'), {
    ...fixture, title: 'Roasters Corner', city: 'Αθήνα', countryName: 'Greece', tags: ['#Coffée', '#espresso'],
  });
  batch.set(searchPins.doc('zz-search-title'), {
    ...fixture, title: 'Coffee Stand', description: '', tags: [],
  });
  batch.set(searchPins.doc('zz-search-private'), {
    ...fixture, title: 'Private coffee', tags: ['coffee'], visibility: 'private', publicAccess: false,
  });
  batch.set(db.collection('users').doc('surname-fixture'), {
    displayName: 'Μαρία Παπαδοπούλου', username: 'explorer_maria', followersCount: 0,
  });
  batch.set(db.collection('users').doc('hyphen-fixture'), {
    displayName: 'Elena García-López', username: 'explorer_elena', followersCount: 0,
  });
  await batch.commit();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.heyroqTest.mountSearchApp());
  assert.equal(await page.evaluate(() => window.heyroqTest.readablePin('zz-search-private')), false);
  await page.evaluate(() => {
    window.pinViewportUnsubscribe = window.heyroqTest.watchPinViewport(ids => { window.pinViewportIds = ids; });
  });
  await page.waitForFunction(() => window.pinViewportIds?.includes('zz-search-tag'));
  assert.equal(await page.evaluate(() => window.pinViewportIds.includes('zz-search-private')), false);
  await page.evaluate(() => window.pinViewportUnsubscribe());
  const searchBox = page.getByRole('textbox', { name: 'Search Heyroq' });
  const searchResults = page.getByRole('region', { name: 'Search results' });
  const matchingSpots = page.getByRole('complementary', { name: 'Matching Spots' });
  const more = page.getByRole('button', { name: 'More', exact: true });
  await more.click();
  const overflow = page.locator('#explore-more-dropdown');
  await overflow.getByRole('menuitem').first().waitFor();
  assert.equal(await overflow.locator('span.w-2.h-2').count(), 0);
  await more.click();

  await searchBox.fill('coffee');
  await searchResults.getByRole('button', { name: /Roasters Corner/ }).waitFor();
  await searchResults.getByRole('button', { name: /Coffee Stand/ }).waitFor();
  assert.equal(await searchResults.getByText('Private coffee').count(), 0);
  await searchResults.getByRole('button', { name: /#coffee/ }).click();
  assert.equal(await searchBox.inputValue(), '#coffee');
  await matchingSpots.getByText('Roasters Corner').waitFor();
  assert.equal(await matchingSpots.getByText('Coffee Stand').count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle search' }).click();
  await searchBox.fill('αθηνα');
  await searchResults.getByRole('button', { name: /Roasters Corner/ }).waitFor();
  await searchResults.getByRole('button', { name: /Αθήνα/, exact: false }).last().waitFor();
  await searchBox.press('Enter');
  await searchResults.waitFor({ state: 'hidden' });
  await matchingSpots.getByText('1 spot found').waitFor();

  await page.setViewportSize({ width: 320, height: 720 });
  const mobileSearchToggle = page.getByRole('button', { name: 'Toggle search' });
  await mobileSearchToggle.click();
  const clearSearch = page.getByRole('button', { name: 'Clear search', exact: true });
  const closeSearch = page.getByRole('button', { name: 'Close search', exact: true });
  await clearSearch.click();
  assert.equal(await searchBox.inputValue(), '');
  assert.ok(await searchBox.evaluate(input => input === document.activeElement));
  await clearSearch.waitFor({ state: 'hidden' });
  assert.equal((await closeSearch.innerText()).trim(), '');
  await closeSearch.locator('svg.lucide-x').waitFor();
  const inputBounds = await searchBox.boundingBox();
  const closeBounds = await closeSearch.boundingBox();
  assert.ok(inputBounds && closeBounds && inputBounds.x + inputBounds.width < closeBounds.x);

  await searchBox.fill('coffee');
  await clearSearch.waitFor();
  await closeSearch.click();
  await searchBox.waitFor({ state: 'hidden' });
  assert.ok(await mobileSearchToggle.evaluate(button => button === document.activeElement));
  await mobileSearchToggle.click();
  assert.equal(await searchBox.inputValue(), 'coffee');
  await closeSearch.click();
  await page.getByRole('button', { name: 'Discover people', exact: true }).click();
  const people = page.getByRole('dialog', { name: 'Discover Explorers' });
  const peopleSearch = people.getByRole('textbox', { name: 'Search people' });
  await peopleSearch.fill('παπαδοπ');
  await people.getByText('Μαρία Παπαδοπούλου', { exact: true }).waitFor();
  assert.equal(await people.getByText('Elena García-López', { exact: true }).count(), 0);

  await peopleSearch.fill('lopez');
  await people.getByText('Elena García-López', { exact: true }).waitFor();
  assert.equal(await people.getByText('Μαρία Παπαδοπούλου', { exact: true }).count(), 0);

  await peopleSearch.fill('@explorer_maria');
  await people.getByText('Μαρία Παπαδοπούλου', { exact: true }).waitFor();
  await people.getByRole('button', { name: 'Close Discover Explorers' }).click();
  await page.evaluate(() => window.heyroqTest.signOut());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in to Heyroq' });
  await signIn.getByRole('button', { name: 'Sign up' }).click();
  const join = page.getByRole('dialog', { name: 'Join Heyroq' });
  const signupUsername = join.getByRole('textbox', { name: 'Username' });
  await join.getByRole('textbox', { name: 'Display Name' }).fill('Username Tester');
  await join.getByLabel('Email Address').fill(randomUUID() + '@example.test');
  await join.getByLabel('Password', { exact: true }).fill('username-test-password');
  await signupUsername.fill('Reserved_Test');
  await join.getByRole('button', { name: 'Create Free Account' }).click();
  await join.getByText('That username is already taken. Choose another.').waitFor();

  await signupUsername.fill('First_Handle');
  await join.getByRole('button', { name: 'Create Free Account' }).click();
  const userMenu = page.getByRole('button', { name: 'User menu' });
  await userMenu.waitFor();
  const claim = await db.doc('usernames/first_handle').get();
  assert.equal((await db.doc('users/' + claim.get('uid')).get()).get('username'), 'first_handle');

  await userMenu.click();
  await page.getByRole('menuitem', { name: 'My Profile & Spots' }).click();
  const ownerProfile = page.getByRole('dialog', { name: "Username Tester's profile" });
  await ownerProfile.getByRole('button', { name: 'Edit Profile' }).click();
  const editUsername = ownerProfile.getByRole('textbox', { name: 'Username' });
  await editUsername.fill('reserved_test');
  await ownerProfile.getByRole('button', { name: 'Save Profile' }).click();
  await ownerProfile.getByRole('alert').getByText('That username is already taken. Choose another.').waitFor();
  assert.ok((await db.doc('usernames/first_handle').get()).exists);

  await editUsername.fill('Second_Handle');
  await ownerProfile.getByRole('button', { name: 'Save Profile' }).click();
  const profileHeader = ownerProfile.locator('header');
  await profileHeader.getByText('@second_handle', { exact: true }).waitFor();
  assert.equal(await profileHeader.evaluate(header => getComputedStyle(header).backdropFilter), 'blur(24px) saturate(1.4)');
  assert.equal((await db.doc('usernames/first_handle').get()).exists, false);
  assert.equal((await db.doc('usernames/second_handle').get()).get('uid'), claim.get('uid'));

  await ownerProfile.getByRole('button', { name: /Close/ }).first().click();
  await page.evaluate(() => window.heyroqTest.signOut());
  const engagementEmail = randomUUID() + '@example.test';
  await page.evaluate(email => window.heyroqTest.signUp(email, 'username-test-password'), engagementEmail);
  const setup = page.getByRole('dialog', { name: 'Finish setting up your profile' });
  await setup.getByRole('textbox', { name: 'Display Name' }).fill('Resumed Explorer');
  await setup.getByRole('textbox', { name: 'Username' }).fill('resumed_explorer');
  await setup.getByRole('button', { name: 'Save Username' }).click();
  await userMenu.waitFor();
  assert.ok((await db.doc('usernames/resumed_explorer').get()).exists);
  const engagementUid = (await db.doc('usernames/resumed_explorer').get()).get('uid');
  const engagementProfile = db.collection('users').doc(engagementUid);
  const bell = page.getByRole('button', { name: /^Notifications(?:, \d+ unread)?$/ });
  await bell.press('Enter');
  const inbox = page.getByRole('dialog', { name: 'Notifications', exact: true });
  const closeInbox = inbox.getByRole('button', { name: 'Close Notifications' });
  await inbox.getByText('You’re all caught up').waitFor();
  assert.ok(await closeInbox.evaluate(button => button === document.activeElement));
  await page.keyboard.press('Tab');
  assert.ok(await inbox.evaluate(dialog => dialog.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  await inbox.waitFor({ state: 'hidden' });
  assert.ok(await bell.evaluate(button => button === document.activeElement));

  const now = Timestamp.now();
  const identifier = n => createHash('sha256').update(String(n)).digest('hex');
  const pinRef = db.doc('pins/activity-browser-fixture');
  // Isolate the exact-count engagement fixtures from delayed XP for this
  // synthetic pin. The real progression writer is exercised earlier above.
  await db.doc('progressionMaintenance/writers').update({ mode: 'frozen' });
  await pinRef.create({ ...fixture, userId: engagementUid, title: 'Activity browser fixture' });
  const pinCreatedAt = (await pinRef.get()).createTime;
  const ownRestricted = db.batch();
  ownRestricted.create(db.doc('pins/own-private-browser'), { ...fixture, userId: engagementUid,
    visibility: 'private', publicAccess: false, title: 'Private owner spot' });
  ownRestricted.create(db.doc('pins/own-draft-browser'), { ...fixture, userId: engagementUid,
    status: 'draft', publicAccess: false, title: 'Draft owner spot' });
  await ownRestricted.commit();
  await userMenu.click();
  await page.getByRole('menuitem', { name: 'My Profile & Spots' }).click();
  const ownPinProfile = page.getByRole('dialog', { name: "Resumed Explorer's profile" });
  await ownPinProfile.getByText('Private owner spot', { exact: true }).waitFor();
  await ownPinProfile.getByText('Draft owner spot', { exact: true }).waitFor();
  await ownPinProfile.getByRole('button', { name: 'Scroll to profile settings' }).click();
  const profileSettingsLink = ownPinProfile.getByRole('button', { name: /Notifications & Activity/ });
  await profileSettingsLink.click();
  const engagementSettings = page.locator('#heyroq-settings-window');
  const closeSettings = engagementSettings.getByRole('button', { name: 'Close Settings' });
  const settingsHeader = engagementSettings.locator('header.liquid-glass-nav');
  assert.equal(await settingsHeader.evaluate(header => getComputedStyle(header).backdropFilter), 'blur(24px) saturate(1.4)');
  await engagementSettings.getByRole('switch', { name: 'Share public activity with followers' }).waitFor();
  await closeSettings.click();
  await ownPinProfile.waitFor({ state: 'hidden' });
  const engagementSeed = db.batch();
  for (let n = 1; n <= 2; n++) {
    engagementSeed.create(engagementProfile.collection('notifications').doc(identifier(n)), {
      type: 'announcement', title: 'Product update ' + n, category: 'system', recipientId: engagementUid,
      at: now, sequence: n, read: false, deleted: false, expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    });
  }
  for (let n = 1; n <= 26; n++) {
    const at = Timestamp.fromMillis(Date.now() - n * 60_000);
    const id = identifier(n);
    engagementSeed.create(engagementProfile.collection('activityV1').doc(id), {
      actorId: engagementUid, type: 'pin', source: pinRef.path, pinId: pinRef.id, pinCreatedAt, at,
      eligible: true, key: String(at.toMillis()).padStart(16, '0') + ':' + id,
    });
  }
  engagementSeed.set(engagementProfile.collection('notificationState').doc('inbox'), { unread: 2, sequence: 2, revision: 1 });
  await engagementSeed.commit();
  await page.getByRole('button', { name: 'Notifications, 2 unread' }).waitFor();
  const secondDevice = await isolatedContext();
  const secondTab = await context.newPage();
  const independentPage = await secondDevice.newPage();
  for (const companion of [secondTab, independentPage]) {
    await companion.goto(origin + '/tests/browser/index.html');
    await companion.waitForFunction(() => Boolean(window.heyroqTest));
    await companion.evaluate(email => window.heyroqTest.signIn(email, 'username-test-password'), engagementEmail);
    await companion.evaluate(() => window.heyroqTest.mountSearchApp());
    try {
      await companion.getByRole('button', { name: 'Notifications, 2 unread' }).waitFor({ timeout: 12_000 });
    } catch (error) {
      const bellLabel = await companion.locator('#nav-notifications-btn').getAttribute('aria-label', { timeout: 1000 }).catch(() => null);
      const unread = (await engagementProfile.collection('notificationState').doc('inbox').get()).get('unread');
      throw new Error('Unread sync failed in ' + (companion === secondTab ? 'the second tab' : 'the second device') +
        ' with bell ' + bellLabel + ' and server count ' + unread, { cause: error });
    }
  }
  await page.bringToFront();
  await bell.click();
  await inbox.getByText('Product update 2').waitFor();
  assert.equal(await inbox.getByText(/^Unread/).count(), 2);
  const viewports = [[1440, 900], [1280, 900], [1024, 900], [768, 1024], [430, 932], [390, 844], [375, 812], [320, 720]];
  for (const [width, height, dark] of viewports.flatMap(([w, h]) => [[w, h, false], [w, h, true]])) {
    await page.setViewportSize({ width, height });
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    const bounds = await inbox.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    if (width < 768) assert.equal(bounds.width, width);
    else {
      const anchor = await bell.boundingBox();
      assert.ok(anchor && bounds.y >= anchor.y + anchor.height);
      assert.ok(bounds.x > width / 3 && bounds.width <= 384 && bounds.y + bounds.height <= height);
      assert.ok(Math.abs(bounds.x + bounds.width - anchor.x - anchor.width) <= 16);
    }
    assert.ok(await inbox.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
    assert.ok(await inbox.evaluate(dialog => {
      const rgb = value => value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      const luminance = channels => channels.map(channel => {
        const s = channel / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
      const background = luminance(rgb(getComputedStyle(dialog).backgroundColor));
      const foreground = luminance(rgb(getComputedStyle(dialog.querySelector('time')).color));
      return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05) >= 4.5;
    }));
    assert.ok(await bell.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.x >= 0 && bounds.right <= innerWidth && bounds.width >= 44 && bounds.height >= 44;
    }));
    if (screenshotDir && (width === 1280 || width === 320)) {
      await page.screenshot({ path: joinPath(screenshotDir, 'notifications-' + width + (dark ? '-dark' : '-light') + '.png'), animations: 'disabled' });
    }
  }
  await inbox.getByRole('button', { name: 'Mark all as read' }).click();
  for (const companion of [secondTab, independentPage]) {
    await companion.getByRole('button', { name: 'Notifications', exact: true }).waitFor();
  }
  await secondTab.close();
  await secondDevice.close();
  await inbox.getByText('Product update 2').waitFor();
  await inbox.getByText(/^Unread/).first().waitFor({ state: 'hidden' });
  await inbox.getByRole('button', { name: 'View history' }).click();
  const notificationsHistory = page.locator('#heyroq-notifications-history-window');
  const deleteNotice = notificationsHistory.getByRole('button', { name: /Delete notification.*Product update 2/ });
  await deleteNotice.click();
  await deleteNotice.waitFor({ state: 'hidden' });
  await notificationsHistory.getByRole('button', { name: 'Close Notifications' }).click();

  await userMenu.click();
  await page.getByRole('menuitem', { name: 'Activity', exact: true }).click();
  const activityPanel = page.getByRole('dialog', { name: 'Activity', exact: true });
  await activityPanel.getByText('No shared activity here yet').waitFor();
  const activityResponse = page.waitForResponse(response => response.url().endsWith('/engagementV1') &&
    response.request().method() === 'POST' && response.request().postDataJSON()?.data?.action === 'mine');
  await activityPanel.getByRole('tab', { name: 'My Activity' }).click();
  const firstActivityPage = (await (await activityResponse).json()).result;
  await activityPanel.getByText(/You published Activity browser fixture/).first().waitFor();
  assert.equal(await activityPanel.getByRole('listitem').count(), 24);
  const moreResponse = page.waitForResponse(response => {
    const request = response.request();
    return response.url().endsWith('/engagementV1') && request.method() === 'POST' &&
      Boolean(request.postDataJSON()?.data?.before);
  });
  await activityPanel.getByRole('button', { name: 'Load more' }).click();
  const payload = await (await moreResponse).json();
  assert.ok(payload.result?.items?.length > 0, JSON.stringify(payload.error ?? payload.result));
  const combined = [...firstActivityPage.items, ...payload.result.items];
  assert.equal(new Set(combined.map(row => row.id)).size, combined.length);
  assert.equal(combined.filter(row => row.type === 'pin' && row.pinId === pinRef.id).length, 26);
  await activityPanel.getByRole('listitem').nth(combined.length - 1).waitFor();
  assert.equal(await activityPanel.getByRole('listitem').count(), combined.length);
  if (screenshotDir) await page.screenshot({ path: joinPath(screenshotDir, 'activity-mobile-dark.png'), animations: 'disabled' });
  await activityPanel.getByRole('button', { name: 'Close Activity' }).click();
  await userMenu.click();
  const settingsLink = page.getByRole('menuitem', { name: 'Settings', exact: true });
  const openNotificationSettings = async () => {
    await settingsLink.click();
    await engagementSettings.locator('#settings-mobile-nav-account').waitFor();
    await engagementSettings.locator('#settings-mobile-nav-notifications').click();
  };
  await openNotificationSettings();
  const likes = engagementSettings.getByRole('switch', { name: 'Likes on my spots' });
  const sharing = engagementSettings.getByRole('switch', { name: 'Share public activity with followers' });
  const preferences = engagementProfile.collection('notificationPreferences').doc('settings');
  assert.equal((await preferences.get()).exists, false);
  await likes.waitFor();
  assert.equal(await likes.isChecked(), true);
  assert.equal(await sharing.isChecked(), false);
  await likes.click();
  await engagementSettings.getByText('Saved', { exact: true }).waitFor();
  assert.deepEqual((await preferences.get()).data(), { likes: false });
  await closeSettings.click();
  await userMenu.click();
  await openNotificationSettings();
  await likes.waitFor();
  assert.equal(await likes.isChecked(), false);
  if (screenshotDir) await page.screenshot({ path: joinPath(screenshotDir, 'activity-settings-mobile-dark.png'), animations: 'disabled' });
  await closeSettings.click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await userMenu.click();
  await settingsLink.click();
  await engagementSettings.getByText('Email Address', { exact: true }).waitFor();
  await engagementSettings.locator('#settings-nav-notifications').click();
  await likes.waitFor();
  assert.equal(await likes.isChecked(), false);
  assert.equal(new URL(page.url()).pathname, '/settings/notifications');
  if (screenshotDir) await page.screenshot({ path: joinPath(screenshotDir, 'activity-settings-desktop-light.png'), animations: 'disabled' });
  await closeSettings.click();

  let releaseRequest;
  const pendingRequest = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/engagementV1', async route => {
    await pendingRequest;
    await route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Simulated connection error' } }),
    });
  });
  await bell.click();
  await inbox.getByText('Loading notifications…', { exact: true }).waitFor();
  releaseRequest();
  await inbox.getByRole('alert').waitFor();
  await inbox.getByRole('button', { name: 'Notification settings' }).click();
  await likes.waitFor();
  assert.equal(await likes.isChecked(), false);
  await closeSettings.click();
  assert.ok(await bell.evaluate(button => button === document.activeElement));
  await bell.click();
  await inbox.getByRole('alert').waitFor();
  await page.unroute('**/engagementV1');
  await inbox.getByRole('button', { name: 'Retry' }).click();
  await inbox.getByText('Product update 1').waitFor();
  // Exercise the application's connectivity handling without switching
  // Chromium's network stack, which can try to probe external connectivity.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  await inbox.getByText('You’re offline. Connect to load notifications.').waitFor();
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'onLine');
    window.dispatchEvent(new Event('online'));
  });
  await inbox.getByText('Product update 1').waitFor();
  await closeInbox.click();

  const groupSeed = db.batch();
  for (const [index, actorId] of ['surname-fixture', 'hyphen-fixture'].entries()) {
    groupSeed.create(engagementProfile.collection('notifications').doc(identifier(80 + index)), {
      type: 'like', category: 'social', actorId, pinId: pinRef.id, pinCreatedAt,
      recipientId: engagementUid, at: Timestamp.now(), sequence: 80 + index, read: false, deleted: false,
    });
  }
  groupSeed.set(engagementProfile.collection('notificationState').doc('inbox'),
    { unread: 2, sequence: 81, revision: 100 }, { merge: true });
  await groupSeed.commit();
  await page.getByRole('button', { name: 'Notifications, 2 unread' }).waitFor();
  await bell.click();
  await inbox.getByText(/^2 likes on Activity browser fixture/).click();
  await inbox.getByText('Μαρία Παπαδοπούλου liked Activity browser fixture.').waitFor();
  await inbox.getByText('Elena García-López liked Activity browser fixture.').waitFor();
  await inbox.getByRole('button', { name: 'Mark as read', exact: true }).first().click();
  await page.locator('#nav-notifications-btn[aria-label="Notifications, 1 unread"]').waitFor({ state: 'attached' });
  await closeInbox.click();
  console.log('Engagement browser passed: desktop, tablet and mobile inbox, focus, activity pagination and persisted preferences.');

  // Exercise the same modal with the real build-time availability gate enabled.
  await context.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  server = undefined;
  const previousGeographyFlag = process.env.VITE_GEOGRAPHY_V11_AVAILABLE;
  try {
    process.env.VITE_GEOGRAPHY_V11_AVAILABLE = 'true';
    await build({
      mode: 'browser-emulator',
      build: { outDir, emptyOutDir: true, rollupOptions: { input: 'tests/browser/index.html' } },
    });
  } finally {
    if (previousGeographyFlag === undefined) delete process.env.VITE_GEOGRAPHY_V11_AVAILABLE;
    else process.env.VITE_GEOGRAPHY_V11_AVAILABLE = previousGeographyFlag;
  }
  server = await preview({ mode: 'browser-emulator', build: { outDir }, preview: {
    host: '127.0.0.1', port: 4173, strictPort: true,
  } });
  const activeContext = await isolatedContext();
  const activePage = await activeContext.newPage();
  const fixtureUrl = origin + '/tests/browser/index.html';
  await activePage.goto(fixtureUrl);
  await activePage.waitForFunction(() => Boolean(window.heyroqTest));
  const activeUid = await activePage.evaluate(id => window.heyroqTest.signUp(id + '@example.test', id), randomUUID());
  await db.doc('users/' + activeUid).set({ displayName: 'Geography browser fixture' });
  const activeProgression = db.collection('progressionV11').doc(activeUid);
  await activeProgression.collection('state').doc('summary').set({ citiesCount: 99, countriesCount: 99 });
  const activeLedger = activeProgression.collection('xpEvents');
  await activeLedger.doc('city_first:legacy').set({ action: 'UNIQUE_CITY', xpEarned: 1 });

  const activeModal = activePage.getByRole('dialog', { name: 'Explorer Progression' });
  const activeCard = name => activeModal.getByRole('article', { name, exact: true });
  const openProfileGeography = async () => {
    await activePage.getByRole('button', { name: 'Open Profile Achievements' }).press('Enter');
    await activeModal.getByRole('button', { name: /^Geography/ }).click();
    await activeCard('City Pathfinder').waitFor();
    assert.equal(await activeModal.getByRole('article').count(), 7);
    assert.equal(await activeModal.getByText(/Coming Soon/i).count(), 0);
  };

  await activePage.evaluate(uid => window.heyroqTest.mountAchievementsTrigger(uid, true), activeUid);
  await openProfileGeography();
  await activeCard('City Pathfinder').getByText('0 / 10', { exact: true }).waitFor();
  await activeCard('World Citizen').getByText('0 / 4', { exact: true }).waitFor();

  const completed = activeProgression.collection('achievements').doc('local_explorer');
  await db.batch()
    .set(activeLedger.doc('geo_v1:city:GR:264371'), { action: 'UNIQUE_CITY', xpEarned: 25 })
    .set(activeLedger.doc('geo_v1:city:GR:734077'), { action: 'UNIQUE_CITY', xpEarned: 25 })
    .set(activeLedger.doc('geo_v1:country:GR'), { action: 'UNIQUE_COUNTRY', xpEarned: 100 })
    .set(completed, { ...history, id: 'local_explorer', title: 'Local Explorer', progress: 1, target: 1 })
    .commit();

  const checkActiveProgress = async () => {
    await activeCard('City Pathfinder').getByText('2 / 10', { exact: true }).waitFor();
    await activeCard('World Citizen').getByText('1 / 4', { exact: true }).waitFor();
    await activeCard('Local Explorer').getByText('Completed', { exact: true }).waitFor();
    assert.equal(await activeCard('Local Explorer').locator('time').getAttribute('datetime'), history.unlockedAt);
    assert.equal(await activeModal.getByText('Completed', { exact: true }).count(), 1);
  };
  for (const [width, height, dark] of [[375, 667, false], [1280, 800, true]]) {
    await activePage.setViewportSize({ width, height });
    await activePage.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await checkActiveProgress();
    const cards = await activeModal.getByRole('article').evaluateAll(items =>
      items.map(item => ({ x: item.getBoundingClientRect().x, overflow: item.scrollWidth > item.clientWidth })));
    assert.ok(cards.every(card => !card.overflow));
    assert.equal(new Set(cards.map(card => card.x)).size, width < 640 ? 1 : 2);
  }
  await activeModal.getByRole('button', { name: 'Close Explorer Progression' }).click();
  await openProfileGeography();
  await checkActiveProgress();
  await activePage.reload();
  await activePage.waitForFunction(() => Boolean(window.heyroqTest));
  assert.equal(await activePage.evaluate(() => window.heyroqTest.currentUserId()), activeUid);
  await activePage.evaluate(uid => window.heyroqTest.mountAchievementsTrigger(uid, true), activeUid);
  await openProfileGeography();
  await checkActiveProgress();
  await activeModal.getByRole('button', { name: /^All Badges/ }).click();
  assert.equal(await activeModal.getByRole('article').count(), 26);
  await activeContext.close();
  console.log('Active Geography browser passed: verified zero, distinct dimensions, completed badge, refresh, profile reopening and both layouts.');
  assert.deepEqual([...unexpected], [], 'Unexpected browser network origins');
  console.log('Browser passed: legacy/managed delivery, token checks, publish and delete retries, avatar cleanup, account deletion intake.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await db.terminate();
  await rm(outDir, { recursive: true, force: true });
}
