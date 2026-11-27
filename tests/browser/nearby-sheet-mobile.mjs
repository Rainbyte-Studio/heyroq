import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';

const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync('/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell')
    ? '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell'
    : undefined);

const makeFixturePins = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `spot-${i + 1}`,
    userId: 'fixture-author',
    userName: `explorer${i + 1}`,
    title: `Heyroq Scenic Spot ${i + 1}`,
    description: `Curated viewpoint and local favorite #${i + 1} for mobile sheet scrolling verification.`,
    latitude: 48.8867 + i * 0.002,
    longitude: 2.3431 + i * 0.002,
    category: 'Scenic',
    tags: ['views'],
    imageUrls: [],
    likeCount: i + 2,
    commentCount: i,
    createdAt: '2026-01-15',
    visibility: 'public',
    publicAccess: true,
    status: 'published',
  }));

const server = await createServer({
  mode: 'browser-emulator',
  define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('test-only') },
  plugins: [
    {
      name: 'nearby-sheet-fixtures',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/context/AuthContext.tsx')) {
          return `
            export const AuthProvider = ({ children }) => children;
            const fixtureAuth = { user: { uid: 'browser-fixture' }, profile: null };
            export const useAuth = () => fixtureAuth;
          `;
        }
        if (id.endsWith('/src/services/pinService.ts')) {
          let patched = code.replace(
            'export function subscribeToViewportPins(bounds: LatLngBounds, onUpdate: (pins: Pin[]) => void) {',
            `export function subscribeToViewportPins(bounds: LatLngBounds, onUpdate: (pins: Pin[]) => void) {
              if (window.nearbyFixture) {
                window.nearbyFixture.viewportListeners.add(onUpdate);
                if (window.nearbyFixture.initialViewportPins) {
                  onUpdate(window.nearbyFixture.initialViewportPins);
                }
                return () => window.nearbyFixture.viewportListeners.delete(onUpdate);
              }`,
          );
          patched = patched.replace(
            `export function subscribeToDiscoveryPins(
  type: 'recent' | 'popular' | 'trending' | 'all',
  category: PinCategory | null | undefined,
  onUpdate: (pins: Pin[], meta?: { fromCache?: boolean }) => void,
  onError?: (err: any) => void,
  limitCount = 50
): () => void {`,
            `export function subscribeToDiscoveryPins(
  type: 'recent' | 'popular' | 'trending' | 'all',
  category: PinCategory | null | undefined,
  onUpdate: (pins: Pin[], meta?: { fromCache?: boolean }) => void,
  onError?: (err: any) => void,
  limitCount = 50
): () => void {
              if (window.nearbyFixture) {
                const entry = { onUpdate, onError };
                window.nearbyFixture.discoveryListeners.add(entry);
                if (window.nearbyFixture.autoEmitMode === 'immediate') {
                  onUpdate(window.nearbyFixture.initialPins ?? [], { fromCache: false });
                } else if (window.nearbyFixture.autoEmitMode === 'error') {
                  onUpdate([], { fromCache: false });
                  onError?.(new Error('offline-fixture'));
                }
                return () => window.nearbyFixture.discoveryListeners.delete(entry);
              }`,
          );
          return patched;
        }
      },
    },
    {
      name: 'mobile-viewport',
      transformIndexHtml: (html) =>
        html.replace(
          '<meta charset="utf-8">',
          '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
        ),
    },
  ],
  server: { host: '127.0.0.1', port: 0 },
});

await server.listen();
const origin = server.resolvedUrls.local[0];

async function createConfiguredPage(browser, profile, fixtureOptions) {
  const page = await browser.newPage(profile);
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );

  await page.addInitScript((opts) => {
    const latLng = (lat, lng) => ({ lat: () => lat, lng: () => lng, toJSON: () => ({ lat, lng }) });
    const event = {
      addListener(target, name, callback) {
        target.listeners ??= new Map();
        const listeners = target.listeners.get(name) ?? new Set();
        listeners.add(callback);
        target.listeners.set(name, listeners);
        return { remove: () => listeners.delete(callback) };
      },
      trigger(target, name, argument) {
        for (const listener of [...(target.listeners?.get(name) ?? [])]) listener(argument);
      },
      removeListener(listener) {
        listener.remove();
      },
      clearInstanceListeners(target) {
        target.listeners?.clear();
      },
    };
    const fixture = (window.mapFixture = { markers: new Set(), stopped: 0, request: {} });
    class MapFixture {
      constructor(div, options) {
        this.div = div;
        this.center = options.center;
        this.zoom = options.zoom;
        div.dataset.testid = 'google-map-surface';
        div.addEventListener('click', (domEvent) => {
          const { lat = 48.8867, lng = 2.3431, placeId } = fixture.request;
          event.trigger(this, 'click', {
            latLng: latLng(lat, lng),
            placeId,
            domEvent,
            stop: () => fixture.stopped++,
          });
        });
        setTimeout(() => event.trigger(this, 'idle'), 40);
      }
      addListener(name, callback) {
        return event.addListener(this, name, callback);
      }
      getDiv() {
        return this.div;
      }
      getCenter() {
        return latLng(this.center.lat, this.center.lng);
      }
      setCenter(point) {
        this.center = point;
      }
      panTo(point) {
        this.setCenter(point);
      }
      getZoom() {
        return this.zoom;
      }
      setZoom(zoom) {
        this.zoom = zoom;
      }
      getMapTypeId() {
        return this.type;
      }
      setMapTypeId(type) {
        this.type = type;
      }
      getBounds() {
        return { getNorthEast: () => latLng(49.0, 2.5), getSouthWest: () => latLng(48.7, 2.1) };
      }
      getProjection() {
        return null;
      }
      setOptions() {}
      moveCamera() {}
    }
    class AdvancedMarkerElement {
      constructor(options = {}) {
        Object.assign(this, options);
        fixture.markers.add(this);
      }
      addListener(name, callback) {
        return event.addListener(this, name, callback);
      }
    }
    class Geocoder {
      geocode({ location }, callback) {
        setTimeout(() => callback([{ formatted_address: 'Montmartre, Paris, France' }], 'OK'), 10);
      }
    }
    const places = {
      AutocompleteSessionToken: class {},
      AutocompleteSuggestion: {
        async fetchAutocompleteSuggestions({ input }) {
          return {
            suggestions: [
              {
                placePrediction: {
                  placeId: 'paris-1',
                  mainText: { text: input },
                  text: { text: `${input}, Paris, France` },
                  secondaryText: { text: 'Paris, France' },
                  toPlace: () => ({
                    formattedAddress: 'Paris, France',
                    location: { lat: () => 48.8867, lng: () => 2.3431 },
                    async fetchFields() {},
                  }),
                },
              },
            ],
          };
        },
      },
      Place: class {
        async fetchFields() {
          this.displayName = 'Sacré-Cœur';
          this.formattedAddress = 'Montmartre, Paris';
        }
      },
    };
    function OverlayView() {}
    OverlayView.prototype.getMap = function () {
      return this.fixtureMap;
    };
    OverlayView.prototype.setMap = function (map) {
      this.fixtureMap = map;
    };
    window.google = {
      maps: {
        Settings: { getInstance: () => ({}) },
        Map: MapFixture,
        OverlayView,
        event,
        importLibrary: async (name) =>
          ({
            places,
            maps: { Map: MapFixture },
            marker: { AdvancedMarkerElement },
            geocoding: { Geocoder },
          })[name] ?? {},
      },
    };

    window.nearbyFixture = {
      autoEmitMode: opts.autoEmitMode,
      initialPins: opts.initialPins,
      initialViewportPins: opts.initialViewportPins ?? null,
      discoveryListeners: new Set(),
      viewportListeners: new Set(),
      emitDiscovery(pins, fromCache = false) {
        for (const l of window.nearbyFixture.discoveryListeners) {
          l.onUpdate(pins, { fromCache });
        }
      },
      emitDiscoveryError() {
        for (const l of window.nearbyFixture.discoveryListeners) {
          l.onUpdate([], { fromCache: false });
          l.onError?.(new Error('offline-fixture'));
        }
      },
    };
  }, fixtureOptions);

  await page.goto(`${origin}tests/browser/index.html`);
  await page.waitForFunction(() => window.heyroqTest);
  await page.evaluate(() => window.heyroqTest.mountSearchApp());
  await page.locator('#pin-discovery-feed-drawer').waitFor();
  return { page, pageErrors };
}

async function dragSheetHandle(page, deltaY) {
  const handle = page.locator('#nearby-spots-sheet-handle');
  const box = await handle.boundingBox();
  assert.ok(box, 'sheet handle bounding box must exist');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX, startY + (deltaY * i) / steps);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(280);
}

const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });

try {
  // 1. iPhone 13: Initial 0 spots -> Collapsed, empty state hidden, controls above sheet, later spots don't auto-move
  {
    const { page, pageErrors } = await createConfiguredPage(browser, devices['iPhone 13'], {
      autoEmitMode: 'immediate',
      initialPins: [],
    });
    const sheet = page.locator('#pin-discovery-feed-drawer');
    await assert.doesNotReject(() =>
      page.waitForFunction(() => document.querySelector('#pin-discovery-feed-drawer')?.dataset.sheetSnap === 'collapsed'),
    );
    assert.equal(await page.locator('#nearby-spots-empty-state').count(), 0, 'Empty state must be hidden in Collapsed state');
    assert.equal(await sheet.getByText('0 spots in this area').count(), 1);
    assert.equal(await page.locator('#nearby-spots-live-indicator').count(), 1);

    // Controls sit cleanly above the collapsed sheet without overlapping header
    const layout = await page.evaluate(() => {
      const header = document.querySelector('header').getBoundingClientRect();
      const controls = document.querySelector('#heyroq-bottom-right-controls').getBoundingClientRect();
      const drawer = document.querySelector('#pin-discovery-feed-drawer').getBoundingClientRect();
      return { headerBottom: header.bottom, controlsTop: controls.top, controlsBottom: controls.bottom, drawerTop: drawer.top };
    });
    assert.ok(layout.controlsTop >= layout.headerBottom + 4, 'Mobile controls must not collide with header');
    assert.ok(layout.controlsBottom <= layout.drawerTop + 2, 'Mobile controls must sit above collapsed sheet');

    // Subsequent spot arrival must NOT auto-reposition after initialization
    await page.evaluate((pins) => window.nearbyFixture.emitDiscovery(pins), makeFixturePins(5));
    await sheet.getByText('5 spots in this area').waitFor();
    await page.waitForTimeout(100);
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed', 'Result count update after init must not auto-reposition');

    // Tap handle cycles: collapsed -> half -> expanded -> collapsed
    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');
    assert.ok((await page.locator('[id^="feed-card-"]').count()) === 5);

    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'expanded');

    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed');

    // Keyboard ArrowUp / ArrowDown / Home / End on handle
    await page.locator('#nearby-spots-sheet-handle').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');
    await page.keyboard.press('ArrowUp');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'expanded');
    await page.keyboard.press('ArrowDown');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');
    await page.keyboard.press('End');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed');

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // 2. iPhone 13: Initial 1+ spots -> Half-expanded, drag up/down, list scrolling & Drop Pin + Choose on Map restoration
  {
    const { page, pageErrors } = await createConfiguredPage(browser, devices['iPhone 13'], {
      autoEmitMode: 'immediate',
      initialPins: makeFixturePins(12),
    });
    const sheet = page.locator('#pin-discovery-feed-drawer');
    await page.waitForFunction(() => document.querySelector('#pin-discovery-feed-drawer')?.dataset.sheetSnap === 'half');

    // Verify half height is approximately 45% of <main>
    const ratios = await page.evaluate(() => {
      const mainH = document.querySelector('main').getBoundingClientRect().height;
      const sheetH = document.querySelector('#pin-discovery-feed-drawer').getBoundingClientRect().height;
      return { ratio: sheetH / mainH };
    });
    assert.ok(ratios.ratio >= 0.40 && ratios.ratio <= 0.50, `Expected half ratio ~0.45, got ${ratios.ratio}`);

    // Drag handle upward to Expanded
    await dragSheetHandle(page, -240);
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'expanded');

    // Verify expanded height is ~85-90% of <main>
    const expRatio = await page.evaluate(() => {
      const mainH = document.querySelector('main').getBoundingClientRect().height;
      const sheetH = document.querySelector('#pin-discovery-feed-drawer').getBoundingClientRect().height;
      return sheetH / mainH;
    });
    assert.ok(expRatio >= 0.84 && expRatio <= 0.92, `Expected expanded ratio ~0.88, got ${expRatio}`);

    // Scroll inside spots list mid-list -> scrollTop updates and sheet stays Expanded
    const listScrollTop = await page.evaluate(() => {
      const list = document.querySelector('#nearby-spots-sheet-content');
      list.scrollTop = 220;
      list.dispatchEvent(new Event('scroll'));
      return list.scrollTop;
    });
    assert.ok(listScrollTop >= 180, 'Spots list must scroll independently');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'expanded');

    // Drag handle downward to Half, then downward to Collapsed
    await dragSheetHandle(page, 210);
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');

    // Open Drop Pin dialog -> focus Search -> close -> verify header stays at top=0 & sheet restores to Half
    await page.locator('#floating-drop-pin-btn').click();
    const dropDialog = page.getByRole('dialog', { name: 'Drop Pin', exact: true });
    await dropDialog.waitFor();
    await dropDialog.getByRole('button', { name: /Search for a Place/i }).click();
    const searchInput = dropDialog.getByRole('combobox', { name: 'Search for a place' });
    await searchInput.waitFor();
    await searchInput.focus();
    await page.waitForTimeout(80);
    const headerTopWhileOpen = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().top);
    assert.equal(Math.round(headerTopWhileOpen), 0, 'Header must not shift while Drop Pin search is focused');

    // Switch to Choose on Map -> verify NO nonfunctional drag handles and clean controls
    await dropDialog.getByRole('button', { name: /Choose on Map/i }).click();
    const pickOverlay = page.getByRole('region', { name: 'Map location selection' });
    await pickOverlay.waitFor();
    assert.equal(await pickOverlay.getByText('Choose a Location').count(), 1);
    assert.equal(await pickOverlay.getByRole('button', { name: 'Select map center' }).count(), 1);
    assert.equal(await pickOverlay.locator('[id*="handle"], .w-9.h-1, .h-1.w-9').count(), 0);

    // Select map center -> verify Selected Location card has Create Pin Here and NO nonfunctional drag handle
    await pickOverlay.getByRole('button', { name: 'Select map center' }).click();
    await pickOverlay.getByRole('button', { name: 'Create Pin Here' }).waitFor();
    assert.equal(await pickOverlay.locator('.w-9.h-1, .h-1.w-9, .w-10.h-1').count(), 0);

    // Cancel Choose on Map -> returns to Drop Pin selector; close Drop Pin -> Nearby Spots restores Half and header stays at top=0
    await pickOverlay.getByRole('button', { name: 'Cancel' }).click();
    if (await dropDialog.isVisible()) {
      await dropDialog.getByRole('button', { name: 'Close Drop Pin' }).click();
      await dropDialog.waitFor({ state: 'hidden' });
    }
    await sheet.waitFor();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half', 'Previous sheet snap must restore after modal/pick flow');
    const headerTopAfterClose = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().top);
    assert.equal(Math.round(headerTopAfterClose), 0, 'Header must remain at top=0 after closing Drop Pin');

    // Drag downward to Collapsed, then verify immediate tap on handle works on the first click
    await dragSheetHandle(page, 180);
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed');
    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // 3. Delayed initial load: user manually expands BEFORE query completes -> preserved even when query returns 0 spots
  {
    const { page, pageErrors } = await createConfiguredPage(browser, devices['Pixel 7'], {
      autoEmitMode: 'manual',
      initialPins: [],
    });
    const sheet = page.locator('#pin-discovery-feed-drawer');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed');
    assert.equal(await sheet.getByText('Loading spots…').count(), 1);

    // User manually expands to half while still loading
    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');

    // Initial query now finishes with 0 spots -> MUST keep user's manual Half position
    await page.evaluate(() => window.nearbyFixture.emitDiscovery([]));
    await sheet.getByText('0 spots in this area').waitFor();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');
    assert.equal(await page.locator('#nearby-spots-empty-state').count(), 1);

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // 4. Query error on initial load -> stays collapsed; expanding shows accessible error & Retry Discovery
  {
    const { page, pageErrors } = await createConfiguredPage(browser, devices['iPhone 13'], {
      autoEmitMode: 'error',
      initialPins: [],
    });
    const sheet = page.locator('#pin-discovery-feed-drawer');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'collapsed');
    await sheet.getByText('Discovery offline').waitFor();
    await page.locator('#nearby-spots-sheet-handle').click();
    assert.equal(await sheet.getAttribute('data-sheet-snap'), 'half');
    assert.equal(await sheet.getByRole('button', { name: 'Retry Discovery' }).count(), 1);

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // 5. Landscape compact mobile viewport -> sheet adapts cleanly and controls never collide with header
  {
    const { page, pageErrors } = await createConfiguredPage(
      browser,
      { viewport: { width: 664, height: 390 }, hasTouch: true, isMobile: true },
      { autoEmitMode: 'immediate', initialPins: makeFixturePins(3) },
    );
    await page.waitForFunction(() => document.querySelector('#pin-discovery-feed-drawer')?.dataset.sheetSnap === 'half');
    const metrics = await page.evaluate(() => {
      const header = document.querySelector('header').getBoundingClientRect();
      const controls = document.querySelector('#heyroq-bottom-right-controls').getBoundingClientRect();
      const drawer = document.querySelector('#pin-discovery-feed-drawer').getBoundingClientRect();
      return { headerBottom: header.bottom, controlsTop: controls.top, drawerTop: drawer.top };
    });
    assert.ok(metrics.controlsTop >= metrics.headerBottom, 'Landscape controls must not overlap top header');
    assert.ok(metrics.drawerTop > metrics.headerBottom, 'Landscape half sheet must remain below header');

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  // 6. Desktop (1280x900): Existing right-side sidebar unchanged, NO mobile drag handle
  {
    const { page, pageErrors } = await createConfiguredPage(
      browser,
      { viewport: { width: 1280, height: 900 } },
      { autoEmitMode: 'immediate', initialPins: makeFixturePins(4) },
    );
    const sheet = page.locator('#pin-discovery-feed-drawer');
    assert.equal(await page.locator('#nearby-spots-sheet-handle').count(), 0, 'Desktop must not render mobile drag handle');
    assert.equal(await sheet.getAttribute('data-sheet-snap'), null, 'Desktop sidebar must not use mobile sheet snap attribute');
    const box = await sheet.boundingBox();
    assert.ok(box && box.width >= 340 && box.width <= 380, `Desktop sidebar width should stay ~344-372px, got ${box?.width}`);
    assert.ok(box.height > 650, 'Desktop sidebar should span full workspace height');

    assert.deepEqual(pageErrors, []);
    await page.close();
  }

  console.log('ALL 6 MOBILE/DESKTOP NEARBY SHEET BROWSER SUITES PASSED');
} finally {
  await browser.close();
  await server.close();
}
