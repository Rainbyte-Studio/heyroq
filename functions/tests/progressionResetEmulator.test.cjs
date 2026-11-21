const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { promisify } = require('node:util');
const { test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { Timestamp, getFirestore } = require('firebase-admin/firestore');

test('reset refuses old publication evidence, preserves profile fields, and runs once', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
  const app = initializeApp({ projectId: 'demo-heyroq' });
  const db = getFirestore(app, 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3');
  const directory = await mkdtemp(join(tmpdir(), 'heyroq-progression-reset-'));
  const backup = join(directory, 'reset.json');
  const script = resolve(__dirname, '../../scripts/reset-explorer-progression.mjs');
  const run = () => promisify(execFile)(process.execPath, [script, 'rehearse', backup]);
  const profile = db.doc('users/reset-fixture');
  const pin = db.doc('pins/reset-fixture');
  const cityBadge = profile.collection('achievements').doc('local_explorer');
  const summary = profile.collection('progression').doc('summary');
  const ledger = profile.collection('xpEvents').doc('geo_v1:fixture');
  const earnedAt = new Timestamp(1700000000, 123456000);
  const originalProfile = { username: 'reset-fixture', photoURL: 'https://example.invalid/photo', followersCount: 0 };

  try {
    await profile.set({ ...originalProfile, citiesCount: 1, countriesCount: 1 });
    await cityBadge.set({ category: 'Geography', isUnlocked: true, unlockedAt: earnedAt });
    await ledger.set({ xpEarned: 25 });
    await summary.set({ xp: 450, level: 2, citiesCount: 1, countriesCount: 1 });
    await pin.set({ userId: profile.id, description: 'preserve me' });
    await assert.rejects(run, /Preserved pins or posts/);
    assert.equal((await pin.get()).get('description'), 'preserve me');
    assert.equal((await summary.get()).get('xp'), 450);
    await pin.delete();

    const { stdout } = await run();
    const report = JSON.parse(stdout);
    assert.equal(report.unlockedGeography, 1);
    assert.equal(report.positiveXp, 1);
    assert.equal(report.xpEvents, 1);
    assert.equal(report.writes, 4);
    assert.deepEqual((await profile.get()).data(), originalProfile);
    for (const doc of [summary, cityBadge, ledger]) assert.equal((await doc.get()).exists, false);

    await ledger.set({ xpEarned: 150 });
    assert.match((await run()).stdout, /already exists/);
    assert.equal((await ledger.get()).get('xpEarned'), 150);

    // Restore the backed-up Firestore field values to an isolated document.
    const { records } = JSON.parse(await readFile(backup, 'utf8'));
    const savedBadge = records.find(document => document.name.endsWith(cityBadge.path));
    const restorePath = savedBadge.name.replace(/local_explorer$/, 'restore_check');
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${restorePath}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: savedBadge.fields }),
    });
    assert.equal(response.ok, true);
    assert.deepEqual((await cityBadge.parent.doc('restore_check').get()).get('unlockedAt'), earnedAt);
  } finally {
    await deleteApp(app);
  }
});
