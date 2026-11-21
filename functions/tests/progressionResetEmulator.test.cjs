const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { resolve } = require('node:path');
const { promisify } = require('node:util');
const { test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { Timestamp, getFirestore } = require('firebase-admin/firestore');

test('reset refuses old publication evidence, preserves profile fields, and runs once', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
  const app = initializeApp({ projectId: 'demo-heyroq' });
  const db = getFirestore(app, 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3');
  const script = resolve(__dirname, '../../scripts/reset-explorer-progression.mjs');
  const run = (mode = 'rehearse-no-backup') => promisify(execFile)(process.execPath, [script, mode]);
  const profile = db.doc('users/reset-fixture');
  const pin = db.doc('pins/reset-fixture');
  const cityBadge = profile.collection('achievements').doc('local_explorer');
  const summary = profile.collection('progression').doc('summary');
  const ledger = profile.collection('xpEvents').doc('geo_v1:fixture');
  const writerControl = db.doc('progressionMaintenance/writers');
  const earnedAt = new Timestamp(1700000000, 123456000);
  const originalProfile = { username: 'reset-fixture', photoURL: 'https://example.invalid/photo', followersCount: 0 };

  try {
    await profile.set({ ...originalProfile, citiesCount: 1, countriesCount: 1 });
    await cityBadge.set({ category: 'Geography', isUnlocked: true, unlockedAt: earnedAt });
    await ledger.set({ xpEarned: 25 });
    await summary.set({ xp: 450, level: 2, citiesCount: 1, countriesCount: 1 });
    await assert.rejects(run, /requires an explicit writer freeze/);
    await writerControl.set({ schemaVersion: 1, mode: 'frozen' });
    await pin.set({ userId: profile.id, description: 'preserve me' });
    await assert.rejects(run, /Preserved pins or posts/);
    assert.equal((await pin.get()).get('description'), 'preserve me');
    assert.equal((await summary.get()).get('xp'), 450);
    await pin.delete();

    const inventory = JSON.parse((await run('inventory')).stdout);
    assert.equal(inventory.writes, 4);
    assert.equal((await ledger.get()).exists, true);

    const { stdout } = await run();
    const report = JSON.parse(stdout);
    assert.equal(report.unlockedGeography, 1);
    assert.equal(report.positiveXp, 1);
    assert.equal(report.xpEvents, 1);
    assert.equal(report.writes, 4);
    assert.equal(Object.hasOwn(report, 'backupSha256'), false);
    assert.deepEqual((await db.doc('progressionMaintenance/geography-v11-reset').get()).data(), {
      resetVersion: 1,
    });
    assert.deepEqual((await profile.get()).data(), originalProfile);
    for (const doc of [summary, cityBadge, ledger]) assert.equal((await doc.get()).exists, false);

    await ledger.set({ xpEarned: 150 });
    assert.match((await run()).stdout, /already exists/);
    assert.equal((await ledger.get()).get('xpEarned'), 150);

  } finally {
    await deleteApp(app);
  }
});
