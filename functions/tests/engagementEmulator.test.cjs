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
  await db.batch().create(pin, { userId: uid, status: 'published', title: 'Public pin', city: 'Untrusted label' })
    .create(db.doc('users/' + uid + '/pinPublishReceipts/' + pin.id), {}).commit();
  return pin;
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

  const command = db.doc('users/' + owner + '/notificationCommands/release');
  await command.create({ type: 'announcement', title: 'What’s new' });
  await emit(onNotificationCommand, command, { uid: owner, id: command.id });
  assert.equal((await noticeState(owner)).get('unread'), 1);
  const accountNotice = (await call(owner, 'inbox')).items.find(row => row.type === 'announcement');
  assert.equal(accountNotice.title, 'What’s new');
  await db.doc('users/' + owner + '/notifications/' + accountNotice.id)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 100) });
  await pruneEngagementHistory.run({});
  assert.equal((await noticeState(owner)).get('unread'), 0);

  await pin.update({ visibility: 'private' });
  const hidden = (await call(owner, 'inbox')).items.find(row => row.type === 'comment');
  assert.equal(hidden.unavailable, true);
  assert.equal(hidden.pinId, undefined);
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
    emit(onActivityPinPublished, pin, { pinId: pin.id })]);

  const timeline = (await call(owner, 'mine')).items;
  assert.deepEqual(timeline.map(row => row.type).sort(), ['achievement', 'city', 'country', 'level', 'pin', 'xp']);
  assert.equal(timeline.find(row => row.type === 'city').title, 'Athens');
  assert.deepEqual((await call(owner, 'inbox')).items.map(row => row.type).sort(), ['achievement', 'geography', 'level']);
  await link(viewer, owner);
  assert.equal((await call(viewer, 'following')).items.length, 0);
  await prefs(owner).set({ shareActivity: true, shareAchievements: true, shareGeography: true });
  const feed = (await call(viewer, 'following')).items;
  assert.deepEqual(feed.map(row => row.type).sort(), ['achievement', 'city', 'country', 'pin']);
  assert.ok(feed.every(row => !('xp' in row) && !('geographicReceipt' in row) && !('level' in row)));
  await prefs(owner).update({ shareGeography: false });
  assert.equal((await call(viewer, 'following')).items.length, 2);
  await db.doc('users/' + viewer + '/following/' + owner).delete();
  assert.equal((await call(viewer, 'following')).items.length, 0);
  await control.update({ progressionStartsAtMs: Date.now() + 5000 });
  assert.deepEqual((await call(owner, 'mine')).items.map(row => row.type), ['pin']);

  await db.recursiveDelete(db.doc('users/' + owner));
  await xpEvent(achievement);
  assert.equal((await noticeState(owner)).exists, false);
  await assert.rejects(call(owner, 'mine'), { code: 'permission-denied' });
});
