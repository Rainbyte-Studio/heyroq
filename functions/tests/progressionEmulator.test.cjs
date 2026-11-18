// Integration tests run only against the local Firestore emulator.
// Never connect this suite to production or use real service-account credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { onPinCreatedProgression, updateUserProgressionServer, FIRESTORE_DATABASE_ID } = require('../lib/index.js');

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
    process.env.GCLOUD_PROJECT !== 'demo-heyroq') {
  throw new Error('Refusing progression integration test outside the local demo-heyroq emulator');
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


const functions = require('../lib/index.js');

test('every progression caller keeps geography frozen and replays without adding ledger entries', async () => {
  const cases = {
    onPinCreatedProgression: ({ pin }) => ({ data: pin }),
    onPinLikeCreated: ({ pin }) => ({ params: { pinId: pin.id } }),
    onPinLikeDeleted: ({ pin }) => ({ params: { pinId: pin.id } }),
    onUserFollowerCreated: ({ id }) => ({ params: { targetUserId: id, followerId: 'matrix-follower' } }),
    onUserFollowerDeleted: ({ id }) => ({ params: { targetUserId: id, followerId: 'matrix-follower' } }),
    onPinDeleted: ({ id, pin }) => ({
      params: { pinId: pin.id + '-deleted' }, data: { data: () => ({ userId: id }) },
    }),
    onUserProfileUpdatedProgression: ({ id }) => ({
      params: { userId: id },
      data: { before: { data: () => ({}) }, after: { data: () => ({ bio: 'Updated bio' }) } },
    }),
    recalculateProgression: ({ id }) => ({ auth: { uid: id, token: {} } }),
  };

  for (const [name, makeEvent] of Object.entries(cases)) {
    const id = 'matrix-' + name;
    const user = db.collection('users').doc(id);
    const ledger = user.collection('xpEvents');
    const metrics = user.collection('progression').doc('summary');
    const badges = user.collection('achievements');
    const pinRef = pins.doc(id);
    const historicalCity = { action: 'UNIQUE_CITY', referenceId: 'athens', xpEarned: 25 };
    const historicalCountry = { action: 'UNIQUE_COUNTRY', referenceId: 'GR', xpEarned: 150 };
    await db.batch()
      .set(user, { displayName: id })
      .set(metrics, { xp: 575, citiesCount: 5, countriesCount: 3 })
      .set(badges.doc('city_scout'), { isUnlocked: true, unlockedAt: '2025-01-01T00:00:00Z' })
      .set(ledger.doc('city_first:athens:GR'), historicalCity)
      .set(ledger.doc('country_first:GR'), historicalCountry)
      .set(pinRef, {
        userId: id, latitude: 48.8566, longitude: 2.3522, city: 'Paris', countryCode: 'FR',
      })
      .commit();

    const event = makeEvent({ id, pin: await pinRef.get() });
    await functions[name].run(event);
    const initial = await ledger.get();
    assert.ok(initial.docs.some(doc => doc.get('action') === 'PIN_CREATED'), name);
    assert.ok(initial.docs.some(doc => doc.get('action') === 'FIRST_DISCOVERY'), name);
    assert.ok(initial.docs.some(doc => doc.get('action') === 'ACHIEVEMENT_UNLOCKED'), name);
    assert.deepEqual(initial.docs.filter(doc => doc.get('action').startsWith('UNIQUE_'))
      .map(doc => [doc.id, doc.data()]), [
      ['city_first:athens:GR', historicalCity],
      ['country_first:GR', historicalCountry],
    ], name);
    const updated = (await metrics.get()).data();
    assert.equal(updated.xp, 400 + initial.docs.reduce((xp, doc) => xp + doc.get('xpEarned'), 0), name);
    assert.equal(updated.citiesCount, 5, name);
    assert.equal(updated.countriesCount, 3, name);
    assert.equal((await badges.doc('city_scout').get()).get('unlockedAt'), '2025-01-01T00:00:00Z', name);
    assert.equal((await badges.doc('metro_hopper').get()).get('isUnlocked'), false, name);
    assert.equal((await user.collection('geographyPins').get()).empty, true, name);

    await Promise.all([functions[name].run(event), functions[name].run(event)]);
    assert.deepEqual((await ledger.get()).docs.map(doc => doc.data()), initial.docs.map(doc => doc.data()), name);
    assert.equal((await metrics.get()).get('xp'), updated.xp, name);
  }
});

test('all compiled endpoints match the deployment manifest, including retry policy', () => {
  const manifest = require('../../docs/progression-deployment-manifest.json');
  const names = Object.keys(functions).filter(name => functions[name].__endpoint);
  assert.deepEqual(names.sort(), Object.keys(manifest.functions).sort());
  for (const [name, { trigger, desiredTimeoutSeconds }] of Object.entries(manifest.functions)) {
    const endpoint = JSON.parse(JSON.stringify(functions[name].__endpoint));
    assert.deepEqual(endpoint.region, [manifest.region], name);
    assert.equal(endpoint.platform, manifest.platform, name);
    assert.equal(endpoint.timeoutSeconds ?? 60, desiredTimeoutSeconds, name);
    if (trigger.type === 'schedule') {
      assert.equal(endpoint.scheduleTrigger.schedule, trigger.schedule, name);
      assert.equal(endpoint.scheduleTrigger.timeZone, trigger.timeZone, name);
      continue;
    }
    if (trigger.type === 'httpsCallable') {
      assert.ok(endpoint.callableTrigger, name);
      continue;
    }
    assert.equal(endpoint.eventTrigger.eventType, trigger.type, name);
    assert.equal(endpoint.eventTrigger.eventFilterPathPatterns.document, trigger.document, name);
    assert.equal(endpoint.eventTrigger.eventFilters.database, manifest.firestore.database, name);
    assert.equal(endpoint.eventTrigger.eventFilters.namespace, manifest.firestore.namespace, name);
    assert.equal(endpoint.eventTrigger.retry, trigger.retryPolicy === 'RETRY_POLICY_RETRY', name);
  }
});

test('account deletion and downstream replay preserve the surviving user ledger', async () => {
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
  const uid = 'matrix-departing-user';
  const survivorId = 'matrix-surviving-user';
  const departing = db.collection('users').doc(uid);
  const survivor = db.collection('users').doc(survivorId);
  const pin = pins.doc('matrix-surviving-pin');
  const like = pin.collection('likes').doc(uid);
  const comment = pin.collection('comments').doc('matrix-comment');
  const follower = survivor.collection('followers').doc(uid);
  await db.batch().set(departing, {}).set(survivor, { followersCount: 1 })
    .set(pin, { userId: survivorId, latitude: 48.8566, longitude: 2.3522, city: 'Paris', countryCode: 'FR' })
    .set(like, { userId: uid }).set(comment, { userId: uid }).set(follower, { followerId: uid })
    .set(departing.collection('following').doc(survivorId), {}).commit();

  const request = { auth: { uid, token: { auth_time: Math.floor(Date.now() / 1000) } } };
  const ledger = survivor.collection('xpEvents');
  let previousEvents;
  for (let delivery = 0; delivery < 2; delivery++) {
    assert.equal((await functions.deleteUserAccount.run(request)).success, true);
    for (const ref of [departing, like, comment, follower]) assert.equal((await ref.get()).exists, false);
    await Promise.all([
      functions.onPinLikeDeleted.run({ params: { pinId: pin.id } }),
      functions.onPinCommentDeleted.run({ params: { pinId: pin.id } }),
      functions.onUserFollowerDeleted.run({ params: { targetUserId: survivorId, followerId: uid } }),
    ]);
    assert.equal((await pin.get()).get('likeCount'), 0);
    assert.equal((await pin.get()).get('commentCount'), 0);
    assert.equal((await survivor.get()).get('followersCount'), 0);
    const events = (await ledger.get()).docs.map(doc => doc.data());
    assert.equal(events.filter(event => event.action === 'PIN_CREATED').length, 1);
    assert.ok(events.every(event => !event.action.startsWith('UNIQUE_')));
    if (previousEvents) assert.deepEqual(events, previousEvents);
    previousEvents = events;
  }
});

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
  await Promise.all([onPinCommentCreated.run(pinEvent), onPinCommentDeleted.run(pinEvent)]);
  assert.equal((await target.collection('progression').doc('summary').get()).get('likesReceivedCount'), 0);
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

test('a slower recomputation cannot publish metrics read before a newer summary commit', { timeout: 20000 }, async t => {
  const uid = 'progression-stale-metrics';
  const user = db.collection('users').doc(uid);
  const metrics = user.collection('progression').doc('summary');
  const pin = pins.doc(uid);
  await user.set({ followersCount: 0 });
  await pin.set({ userId: uid, likeCount: 1, latitude: 38, longitude: 23 });
  await updateUserProgressionServer(uid);

  const staleRead = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const queryPrototype = Object.getPrototypeOf(pins.where('userId', '==', uid));
  const originalGet = queryPrototype.get;
  let intercepted = false;
  t.mock.method(queryPrototype, 'get', async function (...args) {
    const snapshot = await originalGet.apply(this, args);
    if (!intercepted && snapshot.docs.some(doc => doc.ref.path === pin.path)) {
      intercepted = true;
      staleRead.resolve();
      await resume.promise;
    }
    return snapshot;
  });

  const slower = updateUserProgressionServer(uid);
  try {
    await staleRead.promise;
    await pin.update({ likeCount: 12 });
    await updateUserProgressionServer(uid);
    assert.equal((await metrics.get()).get('likesReceivedCount'), 12);
  } finally {
    resume.resolve();
    await slower;
  }
  assert.equal((await metrics.get()).get('likesReceivedCount'), 12);
});

test('legacy and mixed tags cannot crash progression or manufacture rich-discovery XP', async () => {
  const uid = 'progression-legacy-tags';
  const user = db.collection('users').doc(uid);
  await user.set({ displayName: 'Legacy tags' });
  const description = 'A'.repeat(100);
  for (const [suffix, tags] of [
    ['scalar', 'photo'],
    ['mixed', [null, 4, {}, ' ', 'PHoTo']],
    ['valid', [false, 'photo', 'nature']],
  ]) {
    await pins.doc(uid + '-' + suffix).set({ userId: uid, description, tags });
  }
  await updateUserProgressionServer(uid);
  const rich = await user.collection('xpEvents').where('action', '==', 'RICH_DISCOVERY').get();
  assert.deepEqual(rich.docs.map(doc => doc.get('referenceId')), [uid + '-valid']);
});

test('delayed pin deletion preserves recreated children and replacement Storage generation', async () => {
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
  const { getStorage } = require('firebase-admin/storage');
  const uid = 'same-id-owner';
  const pin = pins.doc('same-id-pin');
  const like = pin.collection('likes').doc('same-like');
  const comment = pin.collection('comments').doc('same-comment');
  const bucket = getStorage().bucket();
  const object = bucket.file('pins/' + uid + '/same-image.png');
  const url = 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/' +
    encodeURIComponent(object.name) + '?alt=media';
  await object.save('old');
  const oldGeneration = (await object.getMetadata())[0].generation;
  await pin.set({ userId: uid, imageUrls: [url] });
  await like.set({ userId: uid });
  await comment.set({ text: 'old' });
  await pin.update({ likeCount: 1, commentCount: 1 });
  const event = { params: { pinId: pin.id }, data: await pin.get() };
  await pin.delete();

  await object.save('new');
  const newGeneration = (await object.getMetadata())[0].generation;
  assert.notEqual(newGeneration, oldGeneration);
  await pin.set({ userId: uid, imageUrls: [url] });
  await like.delete();
  await comment.delete();
  await like.set({ userId: uid });
  await comment.set({ text: 'new' });
  await functions.onPinDeleted.run(event);
  assert.equal((await like.get()).exists, true);
  assert.equal((await comment.get()).get('text'), 'new');

  // Replaying the older event after the replacement was also removed must
  // still protect documents created by the replacement incarnation.
  await pin.delete();
  await functions.onPinDeleted.run(event);
  assert.equal((await like.get()).exists, true);
  assert.equal((await comment.get()).get('text'), 'new');
  assert.equal((await object.getMetadata())[0].generation, newGeneration);
  assert.equal((await object.download())[0].toString(), 'new');
});

test('pin deletion removes children known to belong to the deleted snapshot and tolerates replay', async () => {
  const pin = pins.doc('unambiguous-deleted-pin');
  const like = pin.collection('likes').doc('old-like');
  const comment = pin.collection('comments').doc('old-comment');
  await pin.set({ userId: 'deleted-pin-owner' });
  await like.set({ userId: 'old-liker' });
  await comment.set({ text: 'old' });
  await pin.update({ likeCount: 1, commentCount: 1 });
  const event = { params: { pinId: pin.id }, data: await pin.get() };
  await pin.delete();
  await functions.onPinDeleted.run(event);
  await functions.onPinDeleted.run(event);
  assert.equal((await like.get()).exists, false);
  assert.equal((await comment.get()).exists, false);
});

test('managed pin cleanup keeps a replacement pin and mismatched object generation on delay and replay', async () => {
  const { randomUUID } = require('node:crypto');
  const { getStorage } = require('firebase-admin/storage');
  const bucket = getStorage().bucket();
  const pin = pins.doc();
  const userId = 'managed-images-owner';
  const publish = async () => {
    const incarnation = randomUUID();
    const objects = await Promise.all([0, 1].map(async () => {
      const uploadId = randomUUID();
      const file = bucket.file('pin-images/' + userId + '/' + pin.id + '/' + incarnation + '/' + uploadId);
      const metadata = { metadata: { uploadedBy: userId, pinId: pin.id, incarnation, uploadId } };
      await file.save('original', { metadata });
      return { file, metadata, uploadId, generation: String((await file.getMetadata())[0].generation) };
    }));
    const batch = db.batch();
    batch.create(pin, { userId, imageIncarnation: incarnation });
    batch.create(db.collection('pinImageClaims').doc(incarnation), {
      pinId: pin.id, userId, images: objects.map(({ uploadId, generation }) => ({ uploadId, generation })),
    });
    await batch.commit();
    return { incarnation, objects, snapshot: await pin.get() };
  };

  const oldPin = await publish();
  await pin.delete();
  const newPin = await publish();
  const [removed, replaced] = oldPin.objects;
  await replaced.file.save('replacement generation', { metadata: replaced.metadata });
  assert.notEqual(String((await replaced.file.getMetadata())[0].generation), replaced.generation);

  const event = { id: 'managed-pin-delay', params: { pinId: pin.id }, data: oldPin.snapshot };
  await functions.onPinDeleted.run(event);
  await functions.onPinDeleted.run(event);
  assert.equal((await removed.file.exists())[0], false);
  assert.equal((await replaced.file.download())[0].toString(), 'replacement generation');
  assert.equal((await pin.get()).get('imageIncarnation'), newPin.incarnation);
  for (const object of newPin.objects) assert.equal((await object.file.exists())[0], true);
  const job = await db.collection('pinImageCleanupJobs').doc(oldPin.incarnation).get();
  assert.equal(job.get('status'), 'complete');
  assert.deepEqual(job.get('unresolved'), [{ uploadId: replaced.uploadId, reason: 'object-identity-mismatch' }]);
});

test('managed partial failure leaves a recorded job that resumes with the original generations', async () => {
  const { randomUUID } = require('node:crypto');
  const { getStorage } = require('firebase-admin/storage');
  const { cleanupPinImages, resumePinImageCleanup } = require('../lib/pinImageCleanup.js');
  const bucket = getStorage().bucket();
  const pin = pins.doc();
  const userId = 'partial-image-cleanup';
  const incarnation = randomUUID();
  const objects = await Promise.all([0, 1].map(async () => {
    const uploadId = randomUUID();
    const file = bucket.file('pin-images/' + userId + '/' + pin.id + '/' + incarnation + '/' + uploadId);
    const metadata = { metadata: { uploadedBy: userId, pinId: pin.id, incarnation, uploadId } };
    await file.save('original', { metadata });
    return { file, uploadId, generation: String((await file.getMetadata())[0].generation) };
  }));
  const batch = db.batch();
  batch.create(pin, { userId, imageIncarnation: incarnation });
  batch.create(db.collection('pinImageClaims').doc(incarnation), {
    pinId: pin.id, userId, images: objects.map(({ uploadId, generation }) => ({ uploadId, generation })),
  });
  await batch.commit();
  const snapshot = await pin.get();
  await pin.delete();

  const [first, second] = objects;
  const faultyBucket = { file(path) {
    const file = bucket.file(path);
    if (path === second.file.name) return {
      getMetadata: () => file.getMetadata(),
      delete: async () => { throw Object.assign(new Error('transient'), { code: 503 }); },
    };
    return file;
  } };
  await assert.rejects(cleanupPinImages(db, () => faultyBucket, snapshot, 'partial-image-event'), AggregateError);
  const job = db.collection('pinImageCleanupJobs').doc(incarnation);
  assert.equal((await job.get()).get('status'), 'pending');
  assert.equal((await first.file.exists())[0], false);
  assert.equal((await second.file.exists())[0], true);

  await resumePinImageCleanup(db, () => bucket, incarnation);
  await cleanupPinImages(db, () => bucket, snapshot, 'partial-image-event');
  assert.equal((await job.get()).get('status'), 'complete');
  assert.equal((await second.file.exists())[0], false);
});

test('claim reconciliation recovers a missing delete event and preserves a live replacement pin', async () => {
  const { randomUUID } = require('node:crypto');
  const { getStorage } = require('firebase-admin/storage');
  const bucket = getStorage().bucket();
  const pin = pins.doc();
  const userId = 'claim-reconciliation-owner';
  const publish = async () => {
    const incarnation = randomUUID();
    const uploadId = randomUUID();
    const file = bucket.file(['pin-images', userId, pin.id, incarnation, uploadId].join('/'));
    const metadata = { metadata: { uploadedBy: userId, pinId: pin.id, incarnation, uploadId } };
    await file.save('original', { metadata });
    const [{ generation }] = await file.getMetadata();
    const batch = db.batch();
    batch.create(pin, { userId, imageIncarnation: incarnation });
    batch.create(db.collection('pinImageClaims').doc(incarnation), {
      pinId: pin.id, userId, images: [{ uploadId, generation: String(generation) }],
    });
    await batch.commit();
    return { incarnation, file };
  };

  const deleted = await publish();
  const job = db.collection('pinImageCleanupJobs').doc(deleted.incarnation);
  await functions.reconcilePinImageCleanup.run({});
  assert.equal((await job.get()).exists, false);
  assert.equal((await deleted.file.exists())[0], true);
  await pin.delete();
  const live = await publish();
  assert.equal((await job.get()).exists, false);

  await functions.reconcilePinImageCleanup.run({});
  await functions.reconcilePinImageCleanup.run({});
  assert.equal((await job.get()).get('status'), 'complete');
  assert.equal((await deleted.file.exists())[0], false);
  assert.equal((await pin.get()).get('imageIncarnation'), live.incarnation);
  assert.equal((await live.file.exists())[0], true);
});

test('expired upload intents recover verified uploads and preserve unknown or replaced generations', async () => {
  const { randomUUID } = require('node:crypto');
  const { Timestamp } = require('firebase-admin/firestore');
  const { getStorage } = require('firebase-admin/storage');
  const bucket = getStorage().bucket();
  const pinId = pins.doc().id;
  const userId = 'upload-intent-owner';
  const incarnation = randomUUID();
  const intent = db.collection('pinImageUploadIntents').doc(incarnation);
  const job = db.collection('pinImageCleanupJobs').doc(incarnation);
  const uploadIds = Array.from({ length: 3 }, () => randomUUID());
  await intent.create({ pinId, userId, uploadIds, createdAt: Timestamp.now() });
  const objects = await Promise.all(uploadIds.map(async (uploadId, index) => {
    const file = bucket.file(['pin-images', userId, pinId, incarnation, uploadId].join('/'));
    const metadata = { metadata: { uploadedBy: userId, pinId, incarnation, uploadId } };
    await file.save('upload', { metadata });
    if (index !== 1) {
      const [{ generation }] = await file.getMetadata();
      await intent.collection('receipts').doc(uploadId).create({ generation: String(generation) });
    }
    if (index === 2) await file.save('new generation', { metadata });
    return file;
  }));

  await functions.reconcilePinImageCleanup.run({});
  assert.equal((await job.get()).exists, false);
  await intent.update({ createdAt: Timestamp.fromMillis(Date.now() - 61 * 60_000) });
  await functions.reconcilePinImageCleanup.run({});
  await functions.reconcilePinImageCleanup.run({});
  const result = await job.get();
  assert.equal(result.get('status'), 'complete');
  assert.deepEqual(result.get('unresolved'), [
    { uploadId: uploadIds[1], reason: 'missing-upload-generation' },
    { uploadId: uploadIds[2], reason: 'object-identity-mismatch' },
  ]);
  assert.equal((await objects[0].exists())[0], false);
  assert.equal((await objects[1].download())[0].toString(), 'upload');
  assert.equal((await objects[2].download())[0].toString(), 'new generation');
});

test('cleanup stops retrying after the durable attempt limit', async () => {
  const { randomUUID } = require('node:crypto');
  const { resumePinImageCleanup } = require('../lib/pinImageCleanup.js');
  const incarnation = randomUUID();
  const pinId = pins.doc().id;
  const userId = 'exhausted-job-owner';
  const claim = db.collection('pinImageClaims').doc(incarnation);
  const job = db.collection('pinImageCleanupJobs').doc(incarnation);
  const { writeTime } = await claim.create({
    pinId, userId, images: [{ uploadId: randomUUID(), generation: '1' }],
  });
  await job.create({ pinId, userId, claimCreatedAt: writeTime, status: 'pending', attempts: 8 });
  await resumePinImageCleanup(db, () => assert.fail('retry limit must prevent Storage access'), incarnation);
  assert.equal((await job.get()).get('reason'), 'retry-limit');
});

test('Storage SDK sends exact delete preconditions and a stale DELETE preserves the replacement', async () => {
  const { createServer } = require('node:http');
  const { once } = require('node:events');
  const { getStorage } = require('firebase-admin/storage');
  const { Storage } = require('../node_modules/@google-cloud/storage');
  const file = getStorage().bucket().file('pin-images/conditional-delete-regression');
  await file.save('checked');
  const [checked] = await file.getMetadata();
  await file.save('new generation');
  const [replacement] = await file.getMetadata();

  // The Storage emulator ignores DELETE preconditions. Capture the pinned SDK
  // request on loopback and model the documented GCS 412 response here.
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({ method: request.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
    const stale = url.searchParams.get('ifGenerationMatch') !== String(replacement.generation);
    response.writeHead(stale ? 412 : 204, { 'content-type': 'application/json' });
    response.end(stale ? JSON.stringify({ error: { code: 412, message: 'Precondition Failed' } }) : undefined);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
    process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:' + server.address().port;
    let client;
    try {
      client = new Storage({ projectId: 'demo-heyroq' });
    } finally {
      if (emulatorHost === undefined) delete process.env.STORAGE_EMULATOR_HOST;
      else process.env.STORAGE_EMULATOR_HOST = emulatorHost;
    }
    await assert.rejects(client.bucket(file.bucket.name).file(file.name).delete({
      ifGenerationMatch: String(checked.generation),
      ifMetagenerationMatch: String(checked.metageneration),
    }), { code: 412 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'DELETE');
    assert.ok(requests[0].pathname.endsWith("/o/" + encodeURIComponent(file.name)));
    assert.equal(requests[0].query.ifGenerationMatch, String(checked.generation));
    assert.equal(requests[0].query.ifMetagenerationMatch, String(checked.metageneration));
    assert.equal((await file.download())[0].toString(), 'new generation');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
