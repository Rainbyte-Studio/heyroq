// Integration tests run only against the local Firestore emulator.
// Never connect this suite to production or use real service-account credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { onPinCreatedProgression, processPinCreationProgression, updateUserProgressionServer, FIRESTORE_DATABASE_ID } = require('../lib/index.js');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing progression integration test outside demo-* Firestore emulator');
}

const db = getFirestore(FIRESTORE_DATABASE_ID);
const userId = 'integration-progression-user';
const profile = db.collection('users').doc(userId);
const events = profile.collection('xpEvents');
const summary = profile.collection('progression').doc('summary');
const pins = db.collection('pins');

test('account report cleanup paginates submitted and targeted reports and remains safe to retry', async () => {
  const { cleanAccountReports } = require('../lib/index.js');
  const id = 'account-report-cleanup-user';
  const reports = db.collection('reports');
  const batch = db.batch();
  for (let index = 0; index < 201; index++) {
    batch.set(reports.doc('account-cleanup-' + String(index).padStart(3, '0')), {
      reporterId: id, reporterEmail: 'private@example.test', targetId: id,
      targetType: 'user', status: 'pending',
    });
  }
  const unrelated = reports.doc('account-cleanup-unrelated');
  batch.set(unrelated, { reporterEmail: 'keep@example.test', targetId: id, targetType: 'pin', status: 'pending' });
  await batch.commit();

  await cleanAccountReports(id);
  const cleaned = await reports.where('reporterId', '==', id).get();
  assert.equal(cleaned.size, 201);
  for (const report of cleaned.docs) {
    assert.equal(report.get('reporterEmail'), undefined);
    assert.equal(report.get('status'), 'resolved');
  }
  assert.equal((await unrelated.get()).get('status'), 'pending');
  const last = cleaned.docs[200];
  await cleanAccountReports(id);
  assert.ok((await last.ref.get()).updateTime.isEqual(last.updateTime));
});

test('concurrent progression updates produce a consistent, idempotent XP ledger', async () => {
  await profile.set({ displayName: 'Integration User', followersCount: 0 });
  await pins.doc('integration-pin-1').set({
    userId, title: 'Athens A', latitude: 37.98381, longitude: 23.72754,
    city: 'Athens', countryCode: 'GR', category: 'nature',
    description: 'Short', tags: [], createdAt: '2026-01-01T00:00:00Z',
  });
  await pins.doc('integration-pin-2').set({
    userId, title: 'Athens B', latitude: 37.98382, longitude: 23.72755,
    city: 'Athens', countryCode: 'GR', category: 'nature',
    description: 'Short', tags: [], createdAt: '2026-01-02T00:00:00Z',
  });

  // Start several updates together to force overlapping reads and transactions.
  await Promise.all(Array.from({ length: 5 }, () => updateUserProgressionServer(userId)));
  const firstEvents = await events.get();
  const firstSummary = (await summary.get()).data();
  assert.ok(firstSummary, 'progression summary must exist');
  const ledgerXp = firstEvents.docs.reduce((total, doc) => total + Number(doc.data().xpEarned || 0), 0);
  assert.equal(firstSummary.xp, ledgerXp, 'summary XP must match ledger XP');
  assert.equal(firstEvents.docs.filter(doc => doc.data().action === 'PIN_CREATED').length, 1,
    'same-location pins must not generate two discovery XP events');

  // Retried/replayed triggers must not grant additional XP.
  await Promise.all(Array.from({ length: 3 }, () => updateUserProgressionServer(userId)));
  assert.equal((await summary.get()).data().xp, ledgerXp);
  assert.equal((await events.get()).size, firstEvents.size);

  // A deletion lock prevents delayed progression triggers from modifying the account.
  const lock = db.collection('accountDeletionLocks').doc(userId);
  await lock.set({ createdAt: new Date().toISOString() });
  assert.equal(await updateUserProgressionServer(userId), null);
  await lock.delete();
});

test('geography XP and lifetime counts come from earned history', async () => {
  const legacyUserId = 'integration-legacy-geography-user';
  const legacyProfile = db.collection('users').doc(legacyUserId);
  const legacyEvents = legacyProfile.collection('xpEvents');
  const legacySummary = legacyProfile.collection('progression').doc('summary');
  const earnedCity = {
    action: 'UNIQUE_CITY', referenceId: 'athens', xpEarned: 25,
  };
  const earnedCountry = {
    action: 'UNIQUE_COUNTRY', referenceId: 'GR', xpEarned: 150,
  };

  await legacyProfile.set({ displayName: 'Legacy Explorer' });
  await legacySummary.set({ xp: 175, citiesCount: 2, countriesCount: 2 });
  await legacyEvents.doc('city_first:athens:GR').set(earnedCity);
  await legacyEvents.doc('country_first:GR').set(earnedCountry);
  await pins.doc('integration-geography-pin').set({
    userId: legacyUserId, title: 'Athens', latitude: 37.98381, longitude: 23.72754,
    city: 'Paris', country: 'France', countryCode: 'FR', geohash: 'untrusted', locationName: 'Paris, France',
    category: 'nature', description: 'Short', tags: [],
  });

  const pin = await pins.doc('integration-geography-pin').get();
  await Promise.all([onPinCreatedProgression.run({ data: pin }), onPinCreatedProgression.run({ data: pin })]);
  assert.equal((await legacyProfile.collection('geographyPins').get()).empty, true);

  const geographyEvents = (await legacyEvents.get()).docs.filter(doc =>
    ['UNIQUE_CITY', 'UNIQUE_COUNTRY'].includes(doc.data().action));
  assert.deepEqual(geographyEvents.map(doc => [doc.id, doc.data()]), [
    ['city_first:athens:GR', earnedCity],
    ['country_first:GR', earnedCountry],
  ]);
  const updated = (await legacySummary.get()).data();
  assert.equal(updated.citiesCount, 2);
  assert.equal(updated.countriesCount, 2);
  assert.ok(updated.xp > 175, 'ordinary discovery XP still advances');
});

test('new pins use server-resolved geography and geography awards are idempotent under concurrent delivery', async () => {
  const id = 'integration-verified-geography-user';
  const user = db.collection('users').doc(id);
  const ledger = user.collection('xpEvents');
  await user.set({ displayName: 'Verified Explorer' });
  const startAt = Date.now() - 1000;
  const publish = async (pinId, latitude) => {
    const ref = pins.doc(pinId);
    await ref.set({
      userId: id, title: 'Map pin', latitude, longitude: 23.72754,
      city: 'Paris', country: 'France', countryCode: 'FR', geohash: 'untrusted',
      category: 'nature', description: 'Short', tags: [],
    });
    return ref.get();
  };
  const [pinOne, pinTwo] = await Promise.all([
    publish('integration-verified-one', 37.98381), publish('integration-verified-two', 37.98481),
  ]);
  let requests = 0;
  const resolve = async (latitude, longitude) => {
    requests++;
    assert.equal(longitude, 23.72754);
    assert.ok([37.98381, 37.98481].includes(latitude));
    return geographyFixture('GR', 'athens');
  };

  await Promise.all([pinOne, pinTwo, pinOne].map(pin => processPinCreationProgression(pin, startAt, resolve)));
  const first = await ledger.get();
  const geography = first.docs.filter(doc => doc.data().action.startsWith('UNIQUE_'));
  assert.deepEqual(geography.map(doc => doc.id), ['city_first:GR:athens', 'country_first:GR']);
  assert.equal(geography[0].data().attribution, 'Synthetic fixture');
  const metrics = user.collection('progression').doc('summary');
  const previous = (await metrics.get()).data();
  assert.equal(previous.citiesCount, 1);
  assert.equal(previous.countriesCount, 1);
  assert.equal(previous.xp, first.docs.reduce((xp, event) => xp + event.data().xpEarned, 0));
  const completedRequests = requests;
  await processPinCreationProgression(pinOne, startAt, resolve);
  assert.equal(requests, completedRequests, 'committed delivery is skipped before the provider request');
  assert.equal((await metrics.get()).data().xp, previous.xp);
  assert.equal((await ledger.get()).size, first.size);

  const secondCity = await publish('integration-verified-three', 37.95);
  await processPinCreationProgression(secondCity, startAt, async () => geographyFixture('GR', 'piraeus', 'second-city'),
  );
  assert.equal((await ledger.doc('city_first:GR:piraeus').get()).exists, true);
  assert.equal((await ledger.doc('achievement:city_scout').get()).exists, true);
  assert.equal((await metrics.get()).data().citiesCount, 2);
});

test('legacy pins are skipped and provider retries preserve prior awards and ordinary XP', async () => {
  const id = 'integration-geo-retry-user';
  const user = db.collection('users').doc(id);
  const ledger = user.collection('xpEvents');
  await user.set({ displayName: 'Legacy Retry Explorer' });
  await user.collection('progression').doc('summary').set({ xp: 425, citiesCount: 5 });
  const badges = user.collection('achievements');
  await badges.doc('city_scout').set({ isUnlocked: true, unlockedAt: '2025-01-01T00:00:00Z' });
  const oldAward = { action: 'UNIQUE_CITY', referenceId: 'athens', xpEarned: 25 };
  await ledger.doc('city_first:athens:GR').set(oldAward);
  const legacy = pins.doc('integration-geo-old');
  await legacy.set({ userId: id, latitude: 5, longitude: 5, createdAt: '2099-01-01T00:00:00Z' });
  const legacyPin = await legacy.get();
  const startAt = legacyPin.createTime.toMillis() + 1;
  await processPinCreationProgression(legacyPin, startAt, async () => assert.fail('legacy lookup'));
  await new Promise(resolve => setTimeout(resolve, 10));

  const ref = pins.doc('integration-geo-retry');
  await ref.set({ userId: id, latitude: 37.98, longitude: 23.72, createdAt: '2000-01-01T00:00:00Z' });
  const pin = await ref.get();
  const retryable = async () => { throw new Error('Geography verification unavailable'); };
  await assert.rejects(processPinCreationProgression(pin, startAt, retryable), /Geography verification unavailable/);
  assert.equal((await ledger.doc('country_first:GR').get()).exists, false);
  assert.ok((await ledger.get()).docs.some(doc => doc.data().action === 'PIN_CREATED'));

  const verified = async () => geographyFixture('GR', 'athina');
  await processPinCreationProgression(pin, startAt, verified);
  await processPinCreationProgression(pin, startAt, verified);
  const earnedGeography = (await ledger.get()).docs.filter(doc => doc.data().action.startsWith('UNIQUE_'));
  assert.deepEqual(earnedGeography.map(doc => doc.id), ['city_first:athens:GR', 'country_first:GR']);
  assert.deepEqual((await ledger.doc('city_first:athens:GR').get()).data(), oldAward);
  assert.equal((await badges.doc('city_scout').get()).data().unlockedAt, '2025-01-01T00:00:00Z');
  assert.equal((await badges.doc('metro_hopper').get()).data().isUnlocked, false);
  const summary = (await user.collection('progression').doc('summary').get()).data();
  assert.equal(summary.citiesCount, 5);
  const ledgerXp = (await ledger.get()).docs.reduce((xp, event) => xp + event.data().xpEarned, 0);
  assert.equal(summary.xp, ledgerXp + 400, 'new awards add to the legacy XP balance');
  assert.equal((await ledger.doc('achievement:city_scout').get()).exists, false);
});

test('unresolved pins and pins edited during lookup do not create geographic awards', async () => {
  const id = 'integration-geo-ambiguous-user';
  const user = db.collection('users').doc(id);
  await user.set({ displayName: 'Boundaries Explorer' });
  const ref = pins.doc('integration-geo-boundary');
  const startAt = Date.now() - 1000;
  await ref.set({ userId: id, latitude: 37, longitude: 23 });
  const pin = await ref.get();
  await processPinCreationProgression(pin, startAt, async () => null);

  const moved = pins.doc('integration-geo-moved');
  await moved.set({ userId: id, latitude: 37, longitude: 23 });
  await processPinCreationProgression(await moved.get(), startAt, async () => {
    await moved.update({ latitude: 45 });
    return geographyFixture('GR', 'athens');
  },
  );
  const geography = (await user.collection('xpEvents').get()).docs.filter(doc =>
    doc.data().action.startsWith('UNIQUE_'));
  assert.deepEqual(geography, []);
});

function geographyFixture(countryCode, city, cityBoundaryId = 'first-city') {
  return { countryCode, city, cityBoundaryId, attribution: 'Synthetic fixture' };
}

const { onPinLikeCreated, onPinLikeDeleted, onPinCommentCreated, onPinCommentDeleted,
  onUserFollowerCreated, onUserFollowerDeleted } = require('../lib/index.js');

test('social counters converge on current documents after concurrent and replayed deliveries', async () => {
  const targetUserId = 'counter-target';
  const followerId = 'counter-follower';
  const target = db.collection('users').doc(targetUserId);
  const follower = db.collection('users').doc(followerId);
  await Promise.all([target.set({ followersCount: 42 }), follower.set({ followingCount: 99 })]);

  const edge = target.collection('followers').doc(followerId);
  const mirror = follower.collection('following').doc(targetUserId);
  const event = { params: { targetUserId, followerId } };
  await db.batch().set(edge, { followerId }).set(mirror, { targetUserId }).commit();
  await Promise.all([onUserFollowerDeleted.run(event), onUserFollowerCreated.run(event)]);
  assert.equal((await target.get()).get('followersCount'), 1);
  assert.equal((await follower.get()).get('followingCount'), 1);

  await db.batch().delete(edge).delete(mirror).commit();
  await Promise.all([onUserFollowerCreated.run(event), onUserFollowerDeleted.run(event)]);
  assert.equal((await target.get()).get('followersCount'), 0);
  assert.equal((await follower.get()).get('followingCount'), 0);

  const pin = pins.doc('counter-pin');
  await pin.set({ userId: targetUserId, likeCount: 30, commentCount: 40 });
  const like = pin.collection('likes').doc(followerId);
  const comment = pin.collection('comments').doc('comment');
  const pinEvent = { params: { pinId: pin.id } };
  await Promise.all([like.set({}), comment.set({})]);
  await Promise.all([onPinLikeDeleted.run(pinEvent), onPinLikeCreated.run(pinEvent),
    onPinCommentDeleted.run(pinEvent), onPinCommentCreated.run(pinEvent)]);
  const added = await pin.get();
  assert.equal(added.get('likeCount'), 1);
  assert.equal(added.get('commentCount'), 1);
  await onPinCommentCreated.run(pinEvent);
  assert.ok((await pin.get()).updateTime.isEqual(added.updateTime));

  await Promise.all([like.delete(), comment.delete()]);
  await Promise.all([onPinLikeCreated.run(pinEvent), onPinCommentCreated.run(pinEvent)]);
  const removed = await pin.get();
  assert.equal(removed.get('likeCount'), 0);
  assert.equal(removed.get('commentCount'), 0);
  await pin.delete();
  await onPinLikeDeleted.run(pinEvent);
  assert.equal((await pin.get()).exists, false);
});
