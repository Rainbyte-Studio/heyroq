const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
const {
  FIRESTORE_DATABASE_ID, onActivityPinPublished, onNotificationLike, onNotificationComment,
  onNotificationFollow, onActivityProgressionV11Xp, onActivityProgressionV11Level,
  onNotificationCommand, engagementV1, pruneEngagementHistory,
} = require('../lib/index.js');

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(process.env.GCLOUD_PROJECT, 'demo-heyroq');
const db = getFirestore(FIRESTORE_DATABASE_ID);
const actors = new Set();
const cleanup = new Set();
const control = db.doc('progressionMaintenance/writers');
const call = (uid, action, data = {}) => engagementV1.run({
  auth: { uid, token: { firebase: { sign_in_provider: 'password' } } },
  data: { action, ...data },
});
const noticeState = uid => db.doc('users/' + uid + '/notificationState/inbox').get();
const prefs = uid => db.doc('users/' + uid + '/notificationPreferences/settings');
const link = (viewer, author) => db.batch()
  .set(db.doc('users/' + viewer + '/following/' + author), { createdAt: Timestamp.now() })
  .set(db.doc('users/' + author + '/followers/' + viewer), { createdAt: Timestamp.now() }).commit();
const emit = async (handler, ref, params) => handler.run({ data: await ref.get(), params });

async function profile() {
  const uid = randomUUID();
  actors.add(uid);
  await db.doc('users/' + uid).create({ displayName: uid });
  return uid;
}

async function createPin(uid) {
  const pin = db.collection('pins').doc();
  cleanup.add(pin);
  await db.batch().create(pin, { userId: uid, status: 'published', visibility: 'public', publicAccess: true,
    title: 'Public pin', city: 'Untrusted label' })
    .create(db.doc('users/' + uid + '/pinPublishReceipts/' + pin.id), {}).commit();
  return pin;
}

async function runPrune() {
  let status;
  await pruneEngagementHistory({ method: 'POST', headers: {} }, {
    status(code) { status = code; return this; },
    end() {},
    sendStatus(code) { status = code; },
  });
  assert.equal(status, 204);
}

after(async () => {
  for (const uid of actors) {
    await db.recursiveDelete(db.doc('users/' + uid));
    await db.recursiveDelete(db.doc('progressionV11/' + uid));
    await db.doc('accountDeletionLocks/' + uid).delete();
  }
  for (const ref of cleanup) await db.recursiveDelete(ref);
  await control.delete();
  await db.terminate();
});

test('social and system delivery, replay, preferences, exact unread count and deleted content', async () => {
  const [owner, actor] = await Promise.all([profile(), profile()]);
  const pin = await createPin(owner);
  const like = pin.collection('likes').doc(actor);
  const ownLike = pin.collection('likes').doc(owner);
  const comment = pin.collection('comments').doc();
  const reply = pin.collection('comments').doc();
  await db.batch().create(like, { userId: actor }).create(ownLike, { userId: owner })
    .create(comment, { userId: actor }).create(reply, { userId: owner, parentCommentId: comment.id }).commit();
  await link(actor, owner);
  const follower = db.doc('users/' + owner + '/followers/' + actor);
  const emitLike = () => emit(onNotificationLike, like, { pinId: pin.id, actorId: actor });
  await Promise.all([emitLike(), emitLike(), emit(onNotificationLike, ownLike, { pinId: pin.id, actorId: owner }),
    emit(onNotificationComment, comment, { pinId: pin.id, commentId: comment.id }),
    emit(onNotificationComment, reply, { pinId: pin.id, commentId: reply.id }),
    emit(onNotificationFollow, follower, { uid: owner, followerId: actor })]);
  const inbox = await call(owner, 'inbox');
  assert.deepEqual(inbox.items.map(row => row.type).sort(), ['comment', 'follow', 'like']);
  assert.equal((await noticeState(owner)).get('unread'), 3);
  assert.deepEqual((await call(actor, 'inbox')).items.map(row => row.type), ['reply']);
  const replyRow = (await call(actor, 'inbox')).items[0];
  await call(owner, 'delete', { id: replyRow.id });
  await call(owner, 'read', { id: replyRow.id });
  assert.equal((await noticeState(actor)).get('unread'), 1);
  assert.equal((await call(actor, 'inbox')).items[0].read, false);
  const staleLike = await like.get();
  await like.delete();
  await like.create({ userId: actor });
  await emitLike();
  await onNotificationLike.run({ data: staleLike, params: { pinId: pin.id, actorId: actor } });
  assert.equal((await noticeState(owner)).get('unread'), 3);
  const likeRow = inbox.items.find(row => row.type === 'like');
  await Promise.all([call(owner, 'read', { id: likeRow.id }), call(owner, 'read', { id: likeRow.id })]);
  assert.equal((await noticeState(owner)).get('unread'), 2);
  await call(owner, 'delete', { id: likeRow.id });
  await emitLike();
  assert.equal((await call(owner, 'inbox')).items.length, 2);

  await prefs(owner).set({ comments: false });
  const muted = pin.collection('comments').doc();
  await muted.create({ userId: actor });
  await emit(onNotificationComment, muted, { pinId: pin.id, commentId: muted.id });
  await prefs(owner).set({ comments: true });
  await emit(onNotificationComment, muted, { pinId: pin.id, commentId: muted.id });
  await call(owner, 'readAll');
  assert.equal((await noticeState(owner)).get('unread'), 0);
  assert.ok((await call(owner, 'inbox')).items.every(row => row.read));

  const concurrent = db.doc('users/' + owner + '/notificationCommands/concurrent');
  await concurrent.create({ type: 'account', title: 'Account notice' });
  const event = { data: await concurrent.get(), params: { uid: owner, id: concurrent.id } };
  await Promise.all([onNotificationCommand.run(event), call(owner, 'readAll'), onNotificationCommand.run(event)]);
  const concurrentInbox = await call(owner, 'inbox');
  assert.equal(concurrentInbox.items.filter(row => row.type === 'account').length, 1);
  assert.equal((await noticeState(owner)).get('unread'), concurrentInbox.items.filter(row => !row.read).length);
  await call(owner, 'readAll');

  const command = db.doc('users/' + owner + '/notificationCommands/release');
  await command.create({ type: 'announcement', title: 'What’s new' });
  await emit(onNotificationCommand, command, { uid: owner, id: command.id });
  assert.equal((await noticeState(owner)).get('unread'), 1);
  const accountNotice = (await call(owner, 'inbox')).items.find(row => row.type === 'announcement');
  assert.equal(accountNotice.title, 'What’s new');
  await db.doc('users/' + owner + '/notifications/' + accountNotice.id)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 100) });
  await runPrune();
  assert.equal((await noticeState(owner)).get('unread'), 0);

  await pin.update({ visibility: 'private' });
  const hidden = (await call(owner, 'inbox')).items.find(row => row.type === 'comment');
  assert.equal(hidden.unavailable, true);
  assert.equal(hidden.pinId, undefined);
  await pin.update({ visibility: 'public' });
  await comment.delete();
  const orphanedReply = (await call(actor, 'inbox')).items[0];
  assert.equal(orphanedReply.unavailable, true);
  assert.equal(orphanedReply.actorId, undefined);
  assert.equal(orphanedReply.pinId, undefined);
  await db.doc('accountDeletionLocks/' + actor).set({ status: 'deleting' });
  const deleted = (await call(owner, 'inbox')).items.find(row => row.type === 'follow');
  assert.equal(deleted.unavailable, true);
  assert.equal(deleted.actorId, undefined);
  await assert.rejects(call(actor, 'inbox'), { code: 'permission-denied' });
});

test('reads only committed progressionV11 events and revalidates every Following page', async () => {
  const [owner, viewer] = await Promise.all([profile(), profile()]);
  await control.set({ schemaVersion: 1, mode: 'running', generation: 'progressionV11',
    progressionStartsAtMs: 1, geographyStartsAtMs: 1 });
  const pin = await createPin(owner);
  const root = db.doc('progressionV11/' + owner);
  const xp = root.collection('xpEvents');
  const base = xp.doc('pin_created:' + pin.id);
  const achievement = xp.doc('achievement:gold_example');
  const city = xp.doc('geo_v1:city:GR:264371');
  const country = xp.doc('geo_v1:country:GR');
  const summary = root.collection('state').doc('summary');
  const legacy = db.doc('users/' + owner + '/xpEvents/legacy');
  const receipt = { schemaVersion: 2, countryCode: 'GR', cityId: '264371', pinId: pin.id };
  const data = { userId: owner, xpEarned: 25 };
  const previous = await summary.get();
  await db.batch()
    .create(base, { ...data, action: 'PIN_CREATED', referenceId: pin.id })
    .create(achievement, { ...data, action: 'ACHIEVEMENT_UNLOCKED', referenceId: 'gold_example' })
    .create(city, { ...data, action: 'UNIQUE_CITY', referenceId: 'GR:264371', geographicReceipt: receipt })
    .create(country, { ...data, action: 'UNIQUE_COUNTRY', referenceId: 'GR', geographicReceipt: receipt })
    .create(root.collection('achievements').doc('gold_example'), { isUnlocked: true, tier: 'gold', title: 'Example badge' })
    .create(summary, { level: 2 }).create(legacy, { ...data, action: 'PIN_CREATED', referenceId: pin.id }).commit();
  assert.equal(onActivityProgressionV11Xp.__endpoint.eventTrigger.eventFilterPathPatterns.document,
    'progressionV11/{uid}/xpEvents/{eventId}');
  const xpEvent = ref => emit(onActivityProgressionV11Xp, ref, { uid: owner, eventId: ref.id });
  const levelEvent = { data: { before: previous, after: await summary.get() }, params: { uid: owner } };
  await Promise.all([xpEvent(base), xpEvent(achievement), xpEvent(achievement), xpEvent(city), xpEvent(country),
    onActivityProgressionV11Level.run(levelEvent), onActivityProgressionV11Level.run(levelEvent),
    emit(onActivityPinPublished, pin, { pinId: pin.id }), xpEvent(legacy)]);

  const timeline = (await call(owner, 'mine')).items;
  assert.deepEqual(timeline.map(row => row.type).sort(), ['achievement', 'city', 'country', 'level', 'pin', 'xp']);
  assert.equal(timeline.find(row => row.type === 'city').title, 'Athens');
  assert.deepEqual((await call(owner, 'inbox')).items.map(row => row.type).sort(), ['achievement', 'geography', 'level']);
  await link(viewer, owner);
  assert.deepEqual(await call(viewer, 'following'), { items: [], next: null, limited: false });
  await prefs(owner).set({ shareActivity: true, shareAchievements: true, shareGeography: true });
  const feed = (await call(viewer, 'following')).items;
  assert.deepEqual(feed.map(row => row.type).sort(), ['achievement', 'city', 'country', 'pin']);
  assert.ok(feed.every(row => !('xp' in row) && !('geographicReceipt' in row) && !('level' in row)));
  await pin.update({ visibility: 'private', publicAccess: false });
  const revoked = await call(viewer, 'following', { before: '9'.repeat(16) + ':' + 'f'.repeat(64) });
  assert.deepEqual(revoked.items.map(row => row.type), ['achievement']);
  assert.ok(revoked.items.every(row => !('pinId' in row) && !('latitude' in row) && !('longitude' in row)));
  await pin.update({ visibility: 'public', publicAccess: true });
  await db.doc('users/' + owner + '/followers/' + viewer).delete();
  assert.deepEqual((await call(viewer, 'following')).items, []);
  await link(viewer, owner);
  await prefs(owner).update({ shareGeography: false });
  assert.equal((await call(viewer, 'following')).items.length, 2);
  await db.doc('users/' + viewer + '/following/' + owner).delete();
  assert.equal((await call(viewer, 'following')).items.length, 0);
  await control.update({ progressionStartsAtMs: Date.now() + 86_400_000 });
  const beforeCutoff = xp.doc('follower_milestone:1');
  await beforeCutoff.create({ ...data, action: 'FOLLOWER_MILESTONE', referenceId: '1' });
  await xpEvent(beforeCutoff);
  assert.equal((await db.doc('users/' + owner).collection('activityV1').get()).size, 6);
  assert.deepEqual((await call(owner, 'mine')).items.map(row => row.type), ['pin']);

  await db.recursiveDelete(db.doc('users/' + owner));
  await xpEvent(achievement);
  assert.equal((await noticeState(owner)).exists, false);
  await assert.rejects(call(owner, 'mine'), { code: 'permission-denied' });
});

test('validates credentials, cursors and request fields before reading the inbox', async () => {
  const uid = await profile();
  const handler = engagementV1.run;
  await assert.rejects(handler({ data: { action: 'inbox' } }), { code: 'unauthenticated' });
  for (const firebase of [{ sign_in_provider: 'anonymous' }, { sign_in_provider: 'password', tenant: 'other' }, undefined]) {
    await assert.rejects(handler({ auth: { uid, token: { firebase } }, data: { action: 'inbox' } }), { code: 'unauthenticated' });
  }
  for (const [action, payload] of [
    ['inbox', { before: -1 }], ['inbox', { before: 1.1 }], ['mine', { before: '..' }],
    ['following', { uid: 'other' }], ['readAll', { id: 'x' }], ['delete', { id: 'a'.repeat(63) }],
    ['delete', { id: ['a'.repeat(64)] }], ['read', { id: 'a'.repeat(64), extra: true }],
  ]) await assert.rejects(call(uid, action, payload), { code: 'invalid-argument' });
});

test('Following honors the recent 90 relationships and rechecks privacy on cursor requests', async () => {
  const [owner, viewer] = await Promise.all([profile(), profile()]);
  const pin = await createPin(owner);
  await emit(onActivityPinPublished, pin, { pinId: pin.id });
  await prefs(owner).set({ shareActivity: true });
  const following = db.doc('users/' + viewer).collection('following');
  const old = Timestamp.fromMillis(Date.now() - 400_000);
  await db.batch().set(following.doc(owner), { createdAt: old })
    .set(db.doc('users/' + owner + '/followers/' + viewer), { createdAt: old }).commit();
  const writes = db.batch();
  for (let i = 0; i < 90; i++) writes.create(following.doc('fixture-' + i), { createdAt: Timestamp.fromMillis(Date.now() - i) });
  await writes.commit();
  assert.deepEqual(await call(viewer, 'following'), { items: [], next: null, limited: true });
  await following.doc('fixture-0').delete();
  const available = await call(viewer, 'following');
  assert.equal(available.items[0].pinId, pin.id);
  assert.equal(available.limited, false);
  await prefs(owner).set({ shareActivity: false });
  assert.deepEqual(await call(viewer, 'following', { before: '9'.repeat(16) + ':' + 'f'.repeat(64) }),
    { items: [], next: null, limited: false });
});

test('reciprocal production-shaped CloudEvents deliver once in each direction', async () => {
  const { join } = require('node:path');
  const sdkRoot = join(require.resolve('firebase-functions/logger'), '..', '..', '..');
  const { DocumentEventData } = require(join(sdkRoot, 'protos/compiledFirestore')).google.events.cloud.firestore.v1;
  const accounts = await Promise.all([profile(), profile()]);
  const clientTimes = ['2026-11-22T09:20:14.051Z', '2026-11-22T09:20:59.774Z'];
  for (const [index, actor] of accounts.entries()) {
    const recipient = accounts[1 - index];
    const createdAt = clientTimes[index];
    const follower = db.doc(`users/${recipient}/followers/${actor}`);
    const following = db.doc(`users/${actor}/following/${recipient}`);
    await db.batch().set(follower, { followerId: actor, createdAt })
      .set(following, { targetUserId: recipient, createdAt }).commit();

    const { createTime } = await follower.get();
    const document = follower.path;
    const source = `//firestore.googleapis.com/projects/demo-heyroq/databases/${FIRESTORE_DATABASE_ID}`;
    const time = { seconds: createTime.seconds, nanos: createTime.nanoseconds };
    const event = {
      id: randomUUID(), source, project: 'demo-heyroq', database: FIRESTORE_DATABASE_ID,
      document, datacontenttype: 'application/protobuf',
      data: Buffer.from(DocumentEventData.encode({ value: {
        name: `projects/demo-heyroq/databases/${FIRESTORE_DATABASE_ID}/documents/${document}`,
        createTime: time, updateTime: time,
        fields: { followerId: { stringValue: actor }, createdAt: { stringValue: createdAt } },
      } }).finish()),
    };
    await onNotificationFollow(event);
    await onNotificationFollow(event);
    const inbox = await call(recipient, 'inbox');
    assert.deepEqual(inbox.items.map(({ type, actorId }) => ({ type, actorId })), [{ type: 'follow', actorId: actor }]);
    assert.equal((await noticeState(recipient)).get('unread'), 1);
  }
});
