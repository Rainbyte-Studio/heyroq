const { test } = require('node:test');
const assert = require('node:assert/strict');
const { discoveryLocationKey, eligibleDiscoveryIds } = require('../lib/progressionLocation.js');

test('same approximate location cannot earn discovery twice', () => {
  const a = { id: 'a', latitude: 37.98381, longitude: 23.72754, createdAt: '2026-01-01' };
  const b = { id: 'b', latitude: 37.98382, longitude: 23.72755, createdAt: '2026-01-02' };
  assert.deepEqual(eligibleDiscoveryIds([b, a], new Set()), ['a']);
  assert.deepEqual(eligibleDiscoveryIds([b], new Set([discoveryLocationKey(a.latitude, a.longitude)])), []);
});

test('separate locations each receive one event', () => {
  const pins = [
    { id: 'a', latitude: 37.98, longitude: 23.72 },
    { id: 'b', latitude: 38.01, longitude: 23.76 },
  ];
  assert.deepEqual(eligibleDiscoveryIds(pins, new Set()), ['a', 'b']);
});

test('invalid or missing coordinates never receive location XP', () => {
  assert.equal(discoveryLocationKey('37.98', 23.72), null);
  assert.equal(discoveryLocationKey(NaN, 23.72), null);
  assert.equal(discoveryLocationKey(91, 23.72), null);
  assert.deepEqual(eligibleDiscoveryIds([{ id: 'bad', latitude: null, longitude: 23.72 }], new Set()), []);
});

test('ordering is stable when input order changes', () => {
  const pins = [
    { id: 'z', latitude: 37.98, longitude: 23.72, createdAt: '2026-01-02' },
    { id: 'a', latitude: 37.98, longitude: 23.72, createdAt: '2026-01-01' },
  ];
  assert.deepEqual(eligibleDiscoveryIds(pins, new Set()), ['a']);
  assert.deepEqual(eligibleDiscoveryIds([...pins].reverse(), new Set()), ['a']);
});
