const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { test } = require('node:test');
const { Timestamp } = require('firebase-admin/firestore');
const {
  configuredGeographicPolicy, matchesGeographicReceipt, resolveGeographicReceipt,
} = require('../lib/geographicProgression.js');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const created = new Timestamp(2000, 1);
const pin = (overrides = {}, createTime = created, path = 'pins/test') => ({
  createTime, ref: { path },
  data: () => ({ userId: 'pilot', latitude: 38, longitude: 23, status: 'published', ...overrides }),
});
const policy = resolve => ({
  resolver: { version: 'synthetic-1', resolve }, startsAtMs: 1000, pilotUsers: new Set(['pilot']),
  keyId: 'fixture-1', signingKey: privateKey, verificationKey: publicKey,
});
const resolve = (source, config) => resolveGeographicReceipt(source, 'pilot', 'test-db', config);
const matches = (receipt, source, config, user = 'pilot', db = 'test-db') =>
  matchesGeographicReceipt(receipt, source, user, db, config);

test('compiled application ships with geo disabled', () => {
  assert.equal(configuredGeographicPolicy(), undefined);
});

test('receipt binds database, owner, pin ID, incarnation, exact coordinates and canonical result', async () => {
  const source = pin({ city: 'spoofed', countryCode: 'DE', geographicReceipt: 'spoofed' });
  const config = policy(async point => {
    assert.deepEqual(point, { latitude: 38, longitude: 23 });
    return { countryCode: 'GR', cityId: 'place_123' };
  });
  const receipt = await resolve(source, config);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.cityId, 'place_123');
  assert.equal(receipt.countryCode, 'GR');
  assert.ok(matches(receipt, source, config));
  assert.ok(matches(receipt, pin({ city: 'another label' }), config));
  assert.equal(matches(receipt, pin({ longitude: 23.00001 }), config), false);
  assert.equal(matches(receipt, pin({}, new Timestamp(2000, 2)), config), false);
  assert.equal(matches(receipt, pin({}, created, 'pins/other'), config), false);
  assert.equal(matches(receipt, source, config, 'other'), false);
  assert.equal(matches(receipt, source, config, 'pilot', 'other-db'), false);
  assert.equal(matches({ ...receipt, countryCode: 'IT' }, source, config), false);
  assert.equal(matches(receipt, source, { ...config, resolver: { ...config.resolver, version: 'next' } }), false);
});

test('unsupported country abstains, while unresolved city keeps the verified country', async () => {
  for (const countryCode of ['ZZ', 'XK', 'AA', 'gr', 'GR/IT']) {
    assert.equal(await resolve(pin(), policy(async () => ({ countryCode, cityId: 'place_123' }))), undefined);
  }
  assert.equal(await resolve(pin(), policy(async () => null)), undefined);
  for (const cityId of [undefined, 'too/unsafe', 'Η πόλη']) {
    const receipt = await resolve(pin(), policy(async () => ({ countryCode: 'GR', cityId })));
    assert.equal(receipt.cityId, null);
    assert.equal(receipt.countryCode, 'GR');
  }
});

test('eligibility short-circuits before a provider call', async () => {
  let calls = 0;
  const config = policy(async () => { calls++; return null; });
  for (const source of [
    pin({ status: 'draft' }), pin({ status: 'archived' }), pin({ status: 'reported' }),
    pin({ visibility: 'private' }), pin({ isPrivate: true }), pin({ isReported: true }), pin({ isDeleted: true }),
    pin({ userId: 'other' }), pin({ latitude: '38' }), pin({ latitude: Infinity }), pin({ longitude: -181 }),
    pin({}, Timestamp.fromMillis(999)),
  ]) {
    assert.equal(await resolve(source, config), undefined);
  }
  assert.equal(await resolve(pin(), { ...config, pilotUsers: new Set() }), undefined);
  assert.equal(calls, 0);
});

test('provider failure and an unresponsive adapter abstain within the deadline', async () => {
  assert.equal(await resolve(pin(), policy(async () => { throw Error('fixture'); })), undefined);
  let signal;
  const started = performance.now();
  const receipt = await resolve(pin(), policy((_, adapterSignal) => {
    signal = adapterSignal;
    return new Promise(() => {});
  }));
  assert.equal(receipt, undefined);
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - started < 2000);
});
