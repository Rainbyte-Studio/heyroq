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
let failAvatarDelivery = false;
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
        path: join(screenshotDir, `geography-${width}-${dark ? 'dark' : 'light'}.png`),
        animations: 'disabled',
      });
    }
  }
  const historical = profile.collection('achievements').doc('city_scout');
  const history = {
    id: 'city_scout', title: 'Urban Scout', category: 'Geography', iconName: 'Building',
    tier: 'gold', xpReward: 90, isUnlocked: true, progress: 2, target: 2,
    unlockedAt: '2025-01-06T00:00:00Z',
  };
  const legacyProgress = profile.collection('achievements').doc('city_pathfinder');
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
    await page.screenshot({ path: join(screenshotDir, 'geography-historical-dark.png'), animations: 'disabled' });
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
  const xpEvents = profile.collection('xpEvents');
  for (let attempt = 0; attempt < 80 && !(await xpEvents.doc(`pin_created:${pinId}`).get()).exists; attempt++) {
    await delay(250);
  }
  assert.equal((await xpEvents.doc(`pin_created:${pinId}`).get()).get('action'), 'PIN_CREATED');
  assert.deepEqual((await xpEvents.get()).docs.filter(doc =>
    /^(?:UNIQUE_CITY|UNIQUE_COUNTRY)$/.test(doc.get('action')) || doc.id.startsWith('geo_v1:')), []);
  const geographicAwards = await profile.collection('achievements').where('category', '==', 'Geography').get();
  assert.deepEqual(geographicAwards.docs.filter(doc => doc.get('isUnlocked')).map(doc => doc.id), ['city_scout']);
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
  await waitForRemoval(objectFor(urls[0]));
  assert.deepEqual(await page.evaluate(() => window.heyroqTest.deleteAccount()), ['deleting', 'deleting']);
  assert.equal((await db.collection('accountDeletionLocks').doc(uid).get()).get('status'), 'deleting');
  const searchPins = db.collection('pins');
  const batch = db.batch();
  for (let i = 0; i < 150; i++) {
    batch.set(searchPins.doc('aa-search-' + String(i).padStart(3, '0')), { title: 'Unrelated fixture' });
  }
  const fixture = {
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
    ...fixture, title: 'Private coffee', tags: ['coffee'], visibility: 'private',
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
  assert.equal((await closeSearch.innerText()).trim(), 'Close');
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
  await ownerProfile.getByText('@second_handle', { exact: true }).waitFor();
  assert.equal((await db.doc('usernames/first_handle').get()).exists, false);
  assert.equal((await db.doc('usernames/second_handle').get()).get('uid'), claim.get('uid'));

  await page.evaluate(() => window.heyroqTest.signOut());
  await page.evaluate(email => window.heyroqTest.signUp(email, 'username-test-password'), randomUUID() + '@example.test');
  const setup = page.getByRole('dialog', { name: 'Finish setting up your profile' });
  await setup.getByRole('textbox', { name: 'Display Name' }).fill('Resumed Explorer');
  await setup.getByRole('textbox', { name: 'Username' }).fill('resumed_explorer');
  await setup.getByRole('button', { name: 'Save Username' }).click();
  await userMenu.waitFor();
  assert.ok((await db.doc('usernames/resumed_explorer').get()).exists);
  assert.deepEqual([...unexpected], [], 'Unexpected browser network origins');
  console.log('Browser passed: legacy/managed delivery, token checks, publish and delete retries, avatar cleanup, account deletion intake.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await db.terminate();
  await rm(outDir, { recursive: true, force: true });
}
