const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../geographyCatalog.json');
const { configuredGeographicPolicy, validateGeographicSelection } = require('../lib/geographicProgression.js');

test('the shipped policy is disabled', () => {
  assert.equal(configuredGeographicPolicy(), undefined);
});

test('catalog IDs are unique and each city has a catalog country and valid point', () => {
  const countries = new Map(catalog.countries);
  assert.equal(countries.size, catalog.countries.length);
  assert.equal(new Set(catalog.cities.map(city => city[0])).size, catalog.cities.length);
  for (const [cityId, countryCode, , , latitude, longitude] of catalog.cities) {
    assert.ok(countries.has(countryCode));
    assert.deepEqual(validateGeographicSelection({ cityId, countryCode }, latitude, longitude), { cityId, countryCode });
  }
});

test('validates IDs, country membership and plausible pin proximity', () => {
  const athens = { cityId: '264371', countryCode: 'GR' };
  assert.deepEqual(validateGeographicSelection(athens, 38, 23.73), athens);
  for (const input of [null, {}, { ...athens, cityId: 'Athens' }, { ...athens, cityId: '0' },
    { ...athens, cityId: 264371 }, { ...athens, verified: true }, { ...athens, countryCode: 'IT' }]) {
    assert.equal(validateGeographicSelection(input, 38, 23.73), undefined);
  }
  for (const point of [[0, 0], [NaN, 23.73], [90.1, 23.73], [38, Infinity], ['38', 23.73]]) {
    assert.equal(validateGeographicSelection(athens, ...point), undefined);
  }
});
