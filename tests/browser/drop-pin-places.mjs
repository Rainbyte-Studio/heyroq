import assert from 'node:assert/strict';
import { chromium, devices, webkit } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  mode: 'browser-emulator',
  define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('test-only') },
  plugins: [{
    name: 'drop-pin-fixtures',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/context/AuthContext.tsx')) return `
        export const AuthProvider = ({ children }) => children;
        const fixtureAuth = { user: { uid: 'browser-fixture' }, profile: null };
        export const useAuth = () => fixtureAuth;
      `;
      if (id.endsWith('/src/services/pinService.ts')) {
        return code.replace('export function subscribeToViewportPins(bounds: LatLngBounds, onUpdate: (pins: Pin[]) => void) {', `
          export function subscribeToViewportPins(bounds: LatLngBounds, onUpdate: (pins: Pin[]) => void) {
            if (window.mapFixture) {
              onUpdate([{
                id: 'fixture-pin', userId: 'fixture-author', userName: 'Explorer', title: 'Existing Heyroq Spot',
                description: 'Fixture spot', latitude: 38, longitude: 24, category: 'Other', tags: [],
                imageUrls: [], likeCount: 0, commentCount: 0, createdAt: '2025-01-01', visibility: 'public',
              }]);
              return () => {};
            }
        `);
      }
    },
  }, { name: 'mobile-viewport', transformIndexHtml: html => html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">') }],
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const origin = server.resolvedUrls.local[0];

async function test(engine, name, profile, manualPosition) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage(profile);
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error(error));
    await page.route('**/*', route => route.request().url().startsWith(origin)
      ? route.continue() : route.abort());
    await page.addInitScript(() => {
      const queries = [];
      window.placeQueries = queries;
      const library = {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: {
          async fetchAutocompleteSuggestions({ input, sessionToken }) {
            if (!sessionToken) throw new Error('Missing session token');
            queries.push(input);
            if (input === 'Failure') throw new Error('REQUEST_DENIED');
            if (input === 'No results') {
              await new Promise(resolve => setTimeout(resolve, 350));
              return { suggestions: [] };
            }
            if (input === 'Slow') await new Promise(resolve => setTimeout(resolve, 500));
            return { suggestions: Array.from({ length: 5 }, (_, index) => ({
              placePrediction: {
                placeId: input + index,
                mainText: { text: input + ' ' + (index + 1) },
                text: { text: input + ' ' + (index + 1) + ', Greece' },
                secondaryText: { text: 'Greece' },
                toPlace: () => ({
                  formattedAddress: 'Athens 105 58, Greece',
                  location: { lat: () => 37.9715, lng: () => 23.7257 },
                  async fetchFields() {},
                }),
              },
            })) };
          },
        },
      };
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
        removeListener(listener) { listener.remove(); },
        clearInstanceListeners(target) { target.listeners?.clear(); },
      };
      const fixture = window.mapFixture = { markers: new Set(), stopped: 0, request: {}, positionRequests: 0 };
      class MapFixture {
        constructor(div, options) {
          this.div = div;
          this.center = options.center;
          this.zoom = options.zoom;
          div.dataset.testid = 'google-map-surface';
          div.addEventListener('click', domEvent => {
            const { lat = 38, lng = 24, placeId } = fixture.request;
            event.trigger(this, 'click', {
              latLng: latLng(lat, lng), placeId, domEvent, stop: () => fixture.stopped++,
            });
          });
          setTimeout(() => event.trigger(this, 'idle'), 50);
        }
        addListener(name, callback) { return event.addListener(this, name, callback); }
        getDiv() { return this.div; }
        getCenter() { return latLng(this.center.lat, this.center.lng); }
        setCenter(point) { this.center = point; }
        panTo(point) { this.setCenter(point); }
        getZoom() { return this.zoom; }
        setZoom(zoom) { this.zoom = zoom; }
        getMapTypeId() { return this.type; }
        setMapTypeId(type) { this.type = type; }
        getBounds() {
          return { getNorthEast: () => latLng(40, 26), getSouthWest: () => latLng(36, 22) };
        }
        getProjection() { return null; }
        setOptions() {}
        moveCamera() {}
      }
      class AdvancedMarkerElement {
        constructor(options = {}) {
          Object.assign(this, options);
          fixture.markers.add(this);
        }
        addListener(name, callback) { return event.addListener(this, name, callback); }
      }
      class Geocoder {
        geocode({ location }, callback) {
          setTimeout(() => callback([{ formatted_address: 'Address for ' + location.lat }], 'OK'),
            location.lat === 39 ? 350 : 10);
        }
      }
      library.Place = class {
        async fetchFields() {
          this.displayName = 'Acropolis Museum';
          this.formattedAddress = 'Museum address';
        }
      };
      const libraries = { places: library, maps: { Map: MapFixture }, marker: { AdvancedMarkerElement }, geocoding: { Geocoder } };
      function OverlayView() {}
      OverlayView.prototype.getMap = function () { return this.fixtureMap; };
      OverlayView.prototype.setMap = function (map) { this.fixtureMap = map; };
      window.google = { maps: {
        Settings: { getInstance: () => ({}) },
        Map: MapFixture,
        OverlayView,
        event,
        importLibrary: async name => libraries[name] ?? {},
      } };
      fixture.clickExistingPin = () => {
        const marker = [...fixture.markers].reverse().find(item => item.title === 'Existing Heyroq Spot');
        event.trigger(marker, 'gmp-click', new Event('click'));
      };
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition(success, failure) {
          fixture.positionRequests++;
          if (fixture.allowLocation) success({ coords: { latitude: 36, longitude: 22 } });
          else failure({ code: 1 });
        } },
      });
    });
    await page.goto(origin + 'tests/browser/index.html');
    await page.waitForFunction(() => window.heyroqTest);
    await page.evaluate(position => window.heyroqTest.mountCreatePin(position), manualPosition);
    const input = page.getByRole('combobox', { name: 'Location name' });
    const status = message => page.getByRole('status').filter({ hasText: message });
    const position = page.getByRole('spinbutton');
    const mapPosition = () => page.locator('[data-pin-position]').getAttribute('data-pin-position');
    await input.fill('No results');
    await status('Searching places…').waitFor();
    await status('No places found.').waitFor();
    await input.fill('Failure');
    await status('Place search is unavailable.').waitFor();
    await input.fill('Slow');
    await page.waitForFunction(() => window.placeQueries.includes('Slow'));
    await input.fill('');
    await page.waitForTimeout(550);
    assert.equal(await page.getByRole('listbox').count(), 0);
    await input.fill('Ac');
    await input.fill('Acropolis');
    const option = page.getByRole('option', { name: 'Acropolis 5 Greece' });
    await option.waitFor();
    assert.equal(await input.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('option').count(), 5);
    assert.equal(await page.evaluate(() => window.placeQueries.includes('Ac')), false);
    if (profile.hasTouch) {
      await option.tap();
    } else {
      await input.press('Escape');
      assert.equal(await input.getAttribute('aria-expanded'), 'false');
      await input.fill('Athens');
      const last = page.getByRole('option', { name: 'Athens 5 Greece' });
      await last.waitFor();
      await input.press('ArrowUp');
      assert.equal(await input.getAttribute('aria-activedescendant'), await last.getAttribute('id'));
      await input.press('Enter');
    }
    if (manualPosition) {
      const keep = page.getByRole('button', { name: 'Keep pin position and use name' });
      await keep.waitFor();
      assert.equal(await position.first().inputValue(), String(manualPosition.lat));
      assert.equal(await position.last().inputValue(), String(manualPosition.lng));
      await keep.click();
      assert.equal(await input.inputValue(), 'Acropolis 5');
      assert.equal(await page.locator('[data-pin-position]').count(), 0);
      await input.fill('Starbucks');
      await page.getByRole('option', { name: 'Starbucks 1 Greece' }).tap();
      await page.getByRole('button', { name: 'Move pin to this place' }).click();
    }
    await page.getByText('Athens 105 58, Greece · Google Maps', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), manualPosition ? 'Starbucks 1' : 'Athens 5');
    assert.equal(await position.first().inputValue(), '37.9715');
    assert.equal(await position.last().inputValue(), '23.7257');
    assert.equal(await mapPosition(), '37.9715,23.7257');
    await page.evaluate(() => window.heyroqTest.mountSearchApp());
    const dialog = page.getByRole('dialog', { name: 'Drop Pin', exact: true });
    const drop = page.locator('[data-drop-pin-trigger]:visible').first();
    const map = page.getByTestId('google-map-surface');
    const sheet = page.getByRole('region', { name: 'Map location selection' });
    const tapMap = async () => {
      const position = await map.evaluate(surface => {
        const rect = surface.getBoundingClientRect();
        for (let y = 30; y < rect.height; y += 20) {
          for (let x = 30; x < rect.width; x += 20) {
            if (document.elementFromPoint(rect.left + x, rect.top + y) === surface) return { x, y };
          }
        }
        throw new Error('No uncovered map surface');
      });
      return profile.hasTouch ? map.tap({ position }) : map.click({ position });
    };
    const choose = args => page.evaluate(request => { window.mapFixture.request = request; }, args);
    const confirm = sheet.getByRole('button', { name: 'Create Pin Here' });
    const point = () => page.locator('#create-pin-form input[type=number]').evaluateAll(inputs => inputs.map(input => input.valueAsNumber));

    await map.waitFor();
    await tapMap();
    await sheet.getByText('Address for 38', { exact: false }).waitFor();
    assert.equal(await sheet.getByText('Selected location', { exact: true }).count(), 1);
    assert.equal(await dialog.count(), 0);
    await page.waitForFunction(() => [...window.mapFixture.markers].some(marker => marker.map && marker.title === 'New Pin Location'));
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await sheet.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => ![...window.mapFixture.markers].some(marker => marker.map && marker.title === 'New Pin Location'));
    await tapMap();
    await confirm.waitFor();
    await page.locator('#heyroq-map-layers-btn').click();
    await sheet.waitFor({ state: 'hidden' });
    await page.locator('#heyroq-map-layers-btn').click();

    await choose({ lat: 39 });
    await tapMap();
    await choose({ lat: 37, lng: 23, placeId: 'museum' });
    await tapMap();
    await sheet.getByText('Acropolis Museum', { exact: true }).waitFor();
    await sheet.getByText('Museum address', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.mapFixture.stopped), 1);
    await page.waitForFunction(() => [...window.mapFixture.markers].some(marker => marker.title === 'Existing Heyroq Spot'));
    await page.evaluate(() => window.mapFixture.clickExistingPin());
    await sheet.waitFor({ state: 'hidden' });
    await page.getByText('Fixture spot', { exact: true }).first().waitFor();
    const details = page.locator('#pin-detail-modal-overlay');
    if (profile.hasTouch) {
      await details.getByRole('button', { name: /Back to spots|Close Spot Details/ }).first().click();
      await details.waitFor({ state: 'hidden' });
    } else {
      await page.keyboard.press('Escape');
    }

    await drop.click();
    await dialog.getByRole('button', { name: 'Use My Location' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Location permission was denied' }).waitFor();
    assert.equal(await page.evaluate(() => window.mapFixture.positionRequests), 1);
    await dialog.getByRole('button', { name: 'Choose on Map' }).click();
    await sheet.getByRole('button', { name: 'Select map center' }).waitFor();
    await choose({ lat: 37, lng: 23, placeId: 'museum' });
    await tapMap();
    await confirm.click();
    await input.waitFor();
    assert.equal(await input.inputValue(), 'Acropolis Museum');
    assert.deepEqual(await point(), [37, 23]);

    const title = dialog.getByPlaceholder('e.g. Hidden Rooftop Speakeasy with Skyline Views');
    await title.fill('Unpublished draft');
    await dialog.getByPlaceholder('e.g. sunset, coffee, vegan (press enter)').fill('sunset');
    await dialog.getByPlaceholder('e.g. sunset, coffee, vegan (press enter)').press('Enter');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'draft.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=', 'base64'),
    });
    const change = dialog.getByRole('button', { name: 'Change location on map' });
    await change.click();
    await choose({ lat: 39 });
    await tapMap();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await title.inputValue(), 'Unpublished draft');
    assert.equal(await input.inputValue(), 'Acropolis Museum');
    assert.deepEqual(await point(), [37, 23]);
    await change.click();
    await choose({ lat: 38, lng: 24 });
    await tapMap();
    await confirm.click();
    assert.equal(await title.inputValue(), 'Unpublished draft');
    await dialog.getByRole('button', { name: 'Remove tag sunset' }).waitFor();
    await dialog.locator('img[src^="blob:"]').waitFor();
    assert.equal(await input.inputValue(), '');
    assert.deepEqual(await point(), [38, 24]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.getByRole('button', { name: /discard/i }).click();
    await dialog.waitFor({ state: 'hidden' });

    await choose({ lat: 36, lng: 22 });
    await tapMap();
    await sheet.getByText('Address for 36', { exact: false }).waitFor();
    await drop.click();
    await input.waitFor();
    assert.deepEqual(await point(), [36, 22]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });

    await drop.click();
    await dialog.getByRole('button', { name: 'Search for a Place' }).click();
    await dialog.getByRole('combobox', { name: 'Search for a place' }).fill('Athens');
    const list = dialog.getByRole('listbox');
    await list.waitFor();
    if (profile.hasTouch) {
      assert.ok(await list.evaluate(element => element.scrollHeight > element.clientHeight));
      await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.ok(await list.evaluate(element => element.scrollTop > 0));
    }
    await dialog.getByRole('option', { name: 'Athens 5 Greece' }).click();
    await input.waitFor();
    assert.equal(await input.inputValue(), 'Athens 5');
    assert.deepEqual(await point(), [37.9715, 23.7257]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.getByRole('button', { name: /discard/i }).click();

    await drop.click();
    await page.evaluate(() => { window.mapFixture.allowLocation = true; });
    await dialog.getByRole('button', { name: 'Use My Location' }).click();
    await input.waitFor();
    assert.deepEqual(await point(), [36, 22]);
    assert.equal(await input.inputValue(), '');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    if (engine === chromium && profile.hasTouch) {
      const session = await page.context().newCDPSession(page);
      const bounds = await map.boundingBox();
      const x = Math.round(bounds.x + 80);
      const y = Math.round(bounds.y + 35);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 120, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
      assert.equal(await sheet.count(), 0);
    }
    console.log('Passed Drop Pin map, chooser, drafts and autocomplete on ' + name);
  } finally {
    await browser.close();
  }
}

try {
  await test(chromium, 'desktop Chromium', { viewport: { width: 1280, height: 900 } }, null);
  await test(chromium, 'Android viewport', devices['Pixel 7'], { lat: 38, lng: 24 });
  await test(webkit, 'iPhone WebKit viewport', devices['iPhone 13'], { lat: 38, lng: 24 });
} finally {
  await server.close();
}
