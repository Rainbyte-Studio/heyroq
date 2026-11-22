import assert from 'node:assert/strict';
import { chromium, devices, webkit } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  mode: 'browser-emulator',
  define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('test-only') },
  plugins: [{ name: 'mobile-viewport', transformIndexHtml: html => html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">') }],
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
            if (input === 'No results') return { suggestions: [] };
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
      window.google = { maps: {
        Settings: { getInstance: () => ({}) },
        importLibrary: async name => name === 'places' ? library : {},
      } };
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
    console.log('Passed Drop Pin autocomplete on ' + name);
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
