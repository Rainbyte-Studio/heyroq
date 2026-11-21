import { createHash } from 'node:crypto';
import { Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { formatGeographicDiscovery } from './geographicProgression';

const DAY = 86_400_000;
const HISTORY_DAYS = 90;
const PAGE_SIZE = 24;
const FOLLOW_LIMIT = 90;
const privateCollection = 'activityV1';

export const preferenceDefaults = {
  likes: true, comments: true, replies: true, follows: true,
  achievements: true, levels: true, geography: true, announcements: true,
  shareActivity: false, shareAchievements: false, shareGeography: false,
} as const;

type Preference = keyof typeof preferenceDefaults;
type ActivityType = 'pin' | 'xp' | 'city' | 'country' | 'achievement' | 'level';
type NoticeType = 'like' | 'comment' | 'reply' | 'follow' | 'achievement' | 'level' | 'geography' | 'announcement' | 'account';
type Activity = {
  type: ActivityType; source: string; pinId?: string; pinCreatedAt?: Timestamp;
  achievementId?: string; level?: number; xp?: number;
};
type Notice = { type: NoticeType; actorId?: string; pinId?: string; pinCreatedAt?: Timestamp;
  achievementId?: string; level?: number; title?: string; noticeId?: string; source?: string };

export function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 160 && /^[a-zA-Z0-9_:-]+$/.test(value);
}

export function isPublicPin(pin: DocumentSnapshot) {
  return pin.exists && !pin.get('isDeleted') && !pin.get('isPrivate') && !pin.get('isReported') &&
    !pin.get('isDemo') && ['public', undefined].includes(pin.get('visibility')) &&
    ['published', undefined].includes(pin.get('status'));
}

export function preferenceEnabled(data: Record<string, unknown> | undefined, key: Preference) {
  const value = data?.[key];
  return typeof value === 'boolean' ? value : preferenceDefaults[key];
}

export function shareActivity(data: Record<string, unknown> | undefined, type: ActivityType) {
  if (!preferenceEnabled(data, 'shareActivity')) return false;
  if (type === 'pin') return true;
  if (type === 'achievement') return preferenceEnabled(data, 'shareAchievements');
  if (type === 'city' || type === 'country') return preferenceEnabled(data, 'shareGeography');
  return false;
}

const noticePreference: Record<NoticeType, Preference | null> = {
  like: 'likes', comment: 'comments', reply: 'replies', follow: 'follows',
  achievement: 'achievements', level: 'levels', geography: 'geography',
  announcement: 'announcements', account: null,
};

const hash = (key: string) => createHash('sha256').update(key).digest('hex');
const sortKey = (at: Timestamp, id: string) => String(Math.floor(at.toMillis())).padStart(16, '0') + ':' + id;
const incarnation = (at: Timestamp) => at.seconds + ':' + at.nanoseconds;

function allowedAccount(user: DocumentSnapshot, lock: DocumentSnapshot) {
  return user.exists && !lock.exists && user.get('deletionStatus') !== 'deleting';
}

function declaredCutoff(control: DocumentSnapshot) {
  const start = control.get('progressionStartsAtMs');
  return control.get('schemaVersion') === 1 && control.get('mode') === 'running' &&
    control.get('generation') === 'progressionV11' && Number.isSafeInteger(start) && start > 0
    ? Number(start) : Infinity;
}

export function mapXp(event: DocumentSnapshot): Omit<Activity, 'pinCreatedAt'> | undefined {
  const xp = event.get('xpEarned');
  const action = event.get('action');
  const reference = event.get('referenceId');
  const source = event.ref.path;
  if (!Number.isSafeInteger(xp) || xp < 0) return;
  if (action === 'ACHIEVEMENT_UNLOCKED' && validDocumentId(reference) && event.id === 'achievement:' + reference) {
    return { type: 'achievement', achievementId: reference, source, xp };
  }
  const receipt = event.get('geographicReceipt');
  if (receipt?.schemaVersion === 2 && validDocumentId(receipt.pinId)) {
    if (action === 'UNIQUE_CITY' && event.id === 'geo_v1:city:' + reference) {
      return { type: 'city', pinId: receipt.pinId, source, xp };
    }
    if (action === 'UNIQUE_COUNTRY' && event.id === 'geo_v1:country:' + reference) {
      return { type: 'country', pinId: receipt.pinId, source, xp };
    }
  }
  if (xp === 0) return;
  const pinId = ['PIN_CREATED', 'RICH_DISCOVERY', 'FIRST_DISCOVERY'].includes(action) &&
    validDocumentId(reference) ? reference : undefined;
  return { type: 'xp', source, xp, ...(pinId ? { pinId } : {}) };
}

export function buildEngagement(db: Firestore, database: string, region: string) {
  const user = (uid: string) => db.collection('users').doc(uid);
  const lock = (uid: string) => db.collection('accountDeletionLocks').doc(uid);
  const prefs = (uid: string) => user(uid).collection('notificationPreferences').doc('settings');
  const state = (uid: string) => user(uid).collection('notificationState').doc('inbox');
  const inbox = (uid: string) => user(uid).collection('notifications');
  const activity = (uid: string) => user(uid).collection(privateCollection);
  const pins = db.collection('pins');
  const control = db.doc('progressionMaintenance/writers');
  const generation = db.collection('progressionV11');
  const trigger = (document: string) => ({ document, database, region, retry: true });

  async function project(tx: Transaction, uid: string, eventKey: string, at: Timestamp, item?: Activity, notice?: Notice) {
    const id = hash(eventKey);
    const noticeRef = inbox(uid).doc(notice?.noticeId ? hash(notice.noticeId) : id);
    const stateRef = state(uid);
    const activityRef = activity(uid).doc(id);
    const [profile, deletion, settings, previousNotice, inboxState, previousActivity] = await tx.getAll(
      user(uid), lock(uid), prefs(uid), noticeRef, stateRef, activityRef,
    );
    if (!allowedAccount(profile, deletion)) return;

    if (item && !previousActivity.exists) {
      tx.create(activityRef, {
        ...item, actorId: uid, schemaVersion: 1, at, key: sortKey(at, id),
        eligible: ['pin', 'city', 'country', 'achievement'].includes(item.type),
        expiresAt: Timestamp.fromMillis(at.toMillis() + HISTORY_DAYS * DAY),
      });
    }
    if (!notice || previousNotice.exists || notice.actorId === uid) return;
    const preference = noticePreference[notice.type];
    // A suppressed event gets a tombstone, so replay after a preference change cannot deliver it.
    const expiresAt = Timestamp.fromMillis(at.toMillis() + HISTORY_DAYS * DAY);
    if (preference && !preferenceEnabled(settings.data(), preference)) {
      tx.create(noticeRef, { expiresAt, deleted: true });
      return;
    }
    const sequence = (Number(inboxState.get('sequence')) || 0) + 1;
    const { noticeId: _noticeId, ...fields } = notice;
    tx.create(noticeRef, {
      ...fields, recipientId: uid, sequence, at, deleted: false, read: false, expiresAt,
      category: ['like', 'comment', 'reply', 'follow'].includes(notice.type) ? 'social'
        : ['announcement', 'account'].includes(notice.type) ? 'system' : 'progression',
      schemaVersion: 1,
    });
    tx.set(stateRef, { sequence, unread: (Number(inboxState.get('unread')) || 0) + 1,
      revision: (Number(inboxState.get('revision')) || 0) + 1 }, { merge: true });
  }

  function fresh(at: Timestamp) {
    return at.toMillis() > Date.now() - 7 * DAY;
  }

  async function pinEvent(event: DocumentSnapshot) {
    const at = event.createTime;
    if (!at || !fresh(at)) return;
    await db.runTransaction(async tx => {
      const pin = await tx.get(event.ref);
      const uid = pin.get('userId');
      if (!validDocumentId(uid) || !isPublicPin(pin) || !pin.createTime?.isEqual(at)) return;
      const receipt = await tx.get(user(uid).collection('pinPublishReceipts').doc(pin.id));
      if (!receipt.createTime?.isEqual(at)) return;
      await project(tx, uid, 'pin:' + pin.id + ':' + incarnation(at), at, {
        type: 'pin', source: pin.ref.path, pinId: pin.id, pinCreatedAt: at,
      });
    });
  }

  async function social(event: DocumentSnapshot, type: 'like' | 'comment' | 'follow', parentId: string) {
    const at = event.createTime;
    if (!at || !fresh(at)) return;
    await db.runTransaction(async tx => {
      const current = await tx.get(event.ref);
      if (!current.createTime?.isEqual(at)) return;
      const actorId = type === 'comment' ? current.get('userId') : current.id;
      if (!validDocumentId(actorId)) return;
      const [actor, actorLock] = await tx.getAll(user(actorId), lock(actorId));
      if (!allowedAccount(actor, actorLock)) return;
      const eventKey = type + ':' + event.ref.path + ':' + incarnation(at);
      if (type === 'follow') {
        const following = await tx.get(user(actorId).collection('following').doc(parentId));
        if (following.exists) await project(tx, parentId, eventKey, at, undefined, { type, actorId });
        return;
      }
      const pin = await tx.get(pins.doc(parentId));
      if (!isPublicPin(pin) || !pin.createTime || pin.createTime.toMillis() > at.toMillis()) return;
      const parentCommentId = type === 'comment' ? current.get('parentCommentId') : undefined;
      const parent = validDocumentId(parentCommentId)
        ? await tx.get(pin.ref.collection('comments').doc(parentCommentId)) : undefined;
      if (parentCommentId !== undefined && (!parent?.createTime || parent.get('parentCommentId') ||
          parent.createTime.toMillis() > at.toMillis())) return;
      const recipient = parent ? parent.get('userId') : pin.get('userId');
      if (!validDocumentId(recipient) || recipient === actorId) return;
      await project(tx, recipient, eventKey, at, undefined, {
        type: parent ? 'reply' : type, actorId, pinId: pin.id, pinCreatedAt: pin.createTime,
      });
    });
  }

  async function xpEvent(event: DocumentSnapshot, uid: string) {
    const at = event.createTime;
    if (!at || !fresh(at)) return;
    await db.runTransaction(async tx => {
      const [config, current] = await tx.getAll(control, event.ref);
      if (at.toMillis() < declaredCutoff(config) || !current.createTime?.isEqual(at) ||
          current.get('userId') !== uid) return;
      const item = mapXp(current);
      if (!item) return;
      let notice: Notice | undefined;
      if (item.type === 'achievement' && item.achievementId) {
        const earned = await tx.get(generation.doc(uid).collection('achievements').doc(item.achievementId));
        if (earned.get('isUnlocked') !== true) return;
        notice = { type: 'achievement', achievementId: item.achievementId, source: item.source };
      }
      if (item.pinId) {
        const pin = await tx.get(pins.doc(item.pinId));
        if (isPublicPin(pin) && pin.get('userId') === uid && pin.createTime && pin.createTime.toMillis() <= at.toMillis()) {
          Object.assign(item, { pinCreatedAt: pin.createTime });
          if (item.type === 'city' || item.type === 'country') {
            const geoStart = config.get('geographyStartsAtMs');
            if (!Number.isSafeInteger(geoStart) || pin.createTime.toMillis() < geoStart) return;
            notice = { type: 'geography', pinId: item.pinId, pinCreatedAt: pin.createTime, source: item.source,
              noticeId: 'geo:' + item.pinId + ':' + incarnation(pin.createTime) };
          }
        } else if (item.type === 'city' || item.type === 'country') return;
      }
      await project(tx, uid, 'xp:' + event.ref.path + ':' + incarnation(at), at, item, notice);
    });
  }

  async function levelEvent(before: DocumentSnapshot, after: DocumentSnapshot, uid: string) {
    const at = after.updateTime;
    const level = after.get('level');
    const prior = before.get('level') ?? 1;
    if (!at || !fresh(at) || !Number.isSafeInteger(level) || level <= prior) return;
    await db.runTransaction(async tx => {
      const [config, summary] = await tx.getAll(control, after.ref);
      const cutoff = declaredCutoff(config);
      if (at.toMillis() < cutoff || summary.get('level') < level || !summary.exists) return;
      await project(tx, uid, 'level:' + cutoff + ':' + level, at,
        { type: 'level', level, source: after.ref.path }, { type: 'level', level, source: after.ref.path });
    });
  }

  async function systemEvent(event: DocumentSnapshot, uid: string) {
    const at = event.createTime;
    if (!at || !fresh(at)) return;
    await db.runTransaction(async tx => {
      const current = await tx.get(event.ref);
      const type = current.get('type');
      const title = current.get('title');
      if (!current.createTime?.isEqual(at) || (type !== 'announcement' && type !== 'account') ||
          typeof title !== 'string' || !title.trim() || title.length > 180) return;
      await project(tx, uid, 'system:' + event.ref.path, at, undefined, { type, title: title.trim() });
      tx.delete(current.ref);
    });
  }

  async function changeInbox(uid: string, action: 'read' | 'delete' | 'readAll' | 'expire', id?: string) {
    return db.runTransaction(async tx => {
      const [profile, deletion, summary] = await tx.getAll(user(uid), lock(uid), state(uid));
      const active = allowedAccount(profile, deletion);
      if (!active && action !== 'expire') throw new HttpsError('permission-denied', 'Inbox is unavailable.');
      const inboxState = summary.data() ?? {};
      const unread = Number(inboxState.unread) || 0;
      const readThrough = Number(inboxState.readThrough) || 0;
      const revision = (Number(inboxState.revision) || 0) + 1;
      if (action === 'readAll') {
        if (unread) tx.set(summary.ref, { unread: 0, readThrough: inboxState.sequence, revision }, { merge: true });
        return;
      }
      if (!id) return;
      const item = await tx.get(inbox(uid).doc(id));
      if (!item.exists) return;
      const wasUnread = !item.get('deleted') && !item.get('read') && item.get('sequence') > readThrough;
      if (action === 'expire') {
        if (item.get('expiresAt')?.toMillis() > Date.now()) return;
        tx.delete(item.ref);
        if (!active || item.get('deleted')) return;
      } else {
        if (item.get('deleted') || (action === 'read' && !wasUnread)) return;
        if (action === 'delete') tx.set(item.ref, { deleted: true, expiresAt: item.get('expiresAt') });
        else tx.update(item.ref, { read: true });
      }
      tx.set(summary.ref, { unread: Math.max(0, unread - Number(wasUnread)), revision }, { merge: true });
    });
  }

  async function activePin(tx: Transaction, entry: DocumentSnapshot, uid?: string) {
    const id = entry.get('pinId');
    const incarnation = entry.get('pinCreatedAt');
    if (!validDocumentId(id) || !(incarnation instanceof Timestamp)) return;
    const pin = await tx.get(pins.doc(id));
    if (!isPublicPin(pin) || !pin.createTime?.isEqual(incarnation) || (uid && pin.get('userId') !== uid)) return;
    const owner = pin.get('userId');
    if (!validDocumentId(owner)) return;
    const [ownerProfile, deletion] = await tx.getAll(user(owner), lock(owner));
    return allowedAccount(ownerProfile, deletion) ? pin : undefined;
  }

  const label = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 180) : fallback;
  const avatar = (profile: DocumentSnapshot) => {
    const value = profile.get('avatarUrl') || profile.get('photoURL');
    return typeof value === 'string' && value.length <= 1200 ? value : '';
  };

  async function inboxPage(tx: Transaction, uid: string, before?: number) {
    const q = inbox(uid).where('deleted', '==', false).orderBy('sequence', 'desc').limit(PAGE_SIZE);
    const [summary, page, config] = await Promise.all([
      tx.get(state(uid)), tx.get(before ? q.startAfter(before) : q), tx.get(control),
    ]);
    const readThrough = Number(summary.get('readThrough')) || 0;
    const cutoff = declaredCutoff(config);
    const items = await Promise.all(page.docs.map(async entry => {
      const actor = entry.get('actorId');
      const isSocial = entry.get('category') === 'social';
      const [profile, deletion] = validDocumentId(actor) ? await tx.getAll(user(actor), lock(actor)) : [];
      const hasActor = Boolean(profile && deletion && allowedAccount(profile, deletion));
      const pin = await activePin(tx, entry);
      const achievementId = entry.get('achievementId');
      const earned = validDocumentId(achievementId)
        ? await tx.get(generation.doc(uid).collection('achievements').doc(achievementId)) : undefined;
      const sourcePath = entry.get('source');
      const source = typeof sourcePath === 'string' ? await tx.get(db.doc(sourcePath)) : undefined;
      const at: Timestamp = entry.get('at');
      const validProgression = entry.get('category') !== 'progression' ||
        (at.toMillis() >= cutoff && source?.exists &&
          (entry.get('type') === 'level' ? source.get('level') >= entry.get('level')
            : source.createTime?.isEqual(at)));
      const unavailable = !validProgression || (isSocial && !hasActor) || (Boolean(entry.get('pinId')) && !pin) ||
        (Boolean(achievementId) && earned?.get('isUnlocked') !== true);
      return {
        id: entry.id, type: entry.get('type'), at: at.toMillis(),
        read: entry.get('read') || entry.get('sequence') <= readThrough,
        ...(hasActor && !unavailable ? { actorId: actor, name: label(profile?.get('displayName'), 'Explorer'), avatar: profile && avatar(profile) } : {}),
        ...(pin && !unavailable ? { pinId: pin.id, title: label(pin.get('title'), 'Spot') } : {}),
        ...(earned?.get('isUnlocked') === true && !unavailable ? { achievementId, title: label(earned.get('title')) } : {}),
        ...(['announcement', 'account'].includes(entry.get('type')) ? { title: entry.get('title') } : {}),
        level: unavailable ? null : entry.get('level') ?? null,
        unavailable,
      };
    }));
    return { items, next: page.size === PAGE_SIZE ? page.docs.at(-1)?.get('sequence') : null };
  }

  async function activityPage(tx: Transaction, uid: string, following: boolean, before?: string) {
    const [config, relationships] = await Promise.all([
      tx.get(control),
      following ? tx.get(user(uid).collection('following').orderBy('createdAt', 'desc').limit(FOLLOW_LIMIT + 1)) : undefined,
    ]);
    const candidates = relationships?.docs.slice(0, FOLLOW_LIMIT).map(doc => doc.id) ?? [];
    const sharing = new Map<string, FirebaseFirestore.DocumentData>();
    if (candidates.length) {
      const settings = await tx.getAll(...candidates.map(prefs));
      for (const setting of settings) {
        const data = setting.data();
        if (data && preferenceEnabled(data, 'shareActivity')) sharing.set(setting.ref.parent.parent!.id, data);
      }
    }
    const actors = following ? [...sharing.keys()] : [uid];
    const chunks = Array.from({ length: Math.ceil(actors.length / 30) }, (_, i) => actors.slice(i * 30, i * 30 + 30));
    const cutoff = declaredCutoff(config);
    async function present(entry: DocumentSnapshot) {
      const actorId = entry.get('actorId');
      const type: ActivityType = entry.get('type');
      const at = entry.get('at').toMillis();
      if (at <= Date.now() - HISTORY_DAYS * DAY || (type !== 'pin' && at < cutoff)) return;
      if (following && !shareActivity(sharing.get(actorId), type)) return;
      const [profile, deletion] = await tx.getAll(user(actorId), lock(actorId));
      if (!allowedAccount(profile, deletion)) return;
      const pin = await activePin(tx, entry, actorId);
      const geography = type === 'city' || type === 'country';
      if ((type === 'pin' || geography) && !pin) return;
      const source = type === 'pin' ? pin : await tx.get(db.doc(entry.get('source')));
      if (!source?.exists || (type !== 'pin' && type !== 'level' &&
          (!source.createTime?.isEqual(entry.get('at')) || source.get('userId') !== actorId))) return;
      if (type === 'level' && source.get('level') < entry.get('level')) return;
      const aid = entry.get('achievementId');
      const achievement = validDocumentId(aid)
        ? await tx.get(generation.doc(actorId).collection('achievements').doc(aid)) : undefined;
      if (type === 'achievement' && (achievement?.get('isUnlocked') !== true ||
          (following && !['gold', 'platinum'].includes(achievement.get('tier'))))) return;
      return {
        id: entry.id, actorId, type, at, name: label(profile.get('displayName'), 'Explorer'), avatar: avatar(profile),
        ...(pin ? { pinId: pin.id, title: label(pin.get('title'), 'Spot') } : {}),
        ...(geography ? { title: formatGeographicDiscovery(source.get('geographicReceipt'), type === 'city') ?? '' } : {}),
        ...(achievement ? { achievementId: aid, title: label(achievement.get('title')) } : {}),
        ...(!following ? { xp: entry.get('xp') ?? null, level: entry.get('level') ?? null } : {}),
      };
    }

    const items = [];
    let scanAfter = before;
    let lastVisibleKey: string | null = null;
    // Keep the cursor tied to visible content. Hidden records must not disclose
    // their existence or timestamps through the pagination response.
    for (let attempt = 0; attempt < 3 && items.length < PAGE_SIZE; attempt++) {
      const pages = await Promise.all(chunks.map(ids => {
        const collection = following
          ? db.collectionGroup(privateCollection).where('actorId', 'in', ids).where('eligible', '==', true)
          : activity(uid);
        const query = collection.orderBy('key', 'desc').limit(PAGE_SIZE);
        return tx.get(scanAfter ? query.startAfter(scanAfter) : query);
      }));
      const window = pages.flatMap(page => page.docs)
        .sort((a, b) => b.get('key').localeCompare(a.get('key'))).slice(0, PAGE_SIZE);
      const rows = await Promise.all(window.map(present));
      for (const [index, row] of rows.entries()) {
        if (!row) continue;
        items.push(row);
        lastVisibleKey = window[index].get('key');
        if (items.length === PAGE_SIZE) break;
      }
      if (window.length < PAGE_SIZE) break;
      scanAfter = window.at(-1)?.get('key');
    }
    return { items, next: items.length === PAGE_SIZE ? lastVisibleKey : null, limited: (relationships?.size ?? 0) > FOLLOW_LIMIT };
  }

  async function prune() {
    const now = Timestamp.now();
    const [expiredNotices, expiredActivity] = await Promise.all([
      db.collectionGroup('notifications').where('expiresAt', '<=', now).limit(150).get(),
      db.collectionGroup(privateCollection).where('expiresAt', '<=', now).limit(150).get(),
    ]);
    // Expiration and read mutations share the same transaction/cardinality invariant.
    for (let offset = 0; offset < expiredNotices.size; offset += 10) {
      await Promise.all(expiredNotices.docs.slice(offset, offset + 10).map(item =>
        changeInbox(item.ref.parent.parent!.id, 'expire', item.id)));
    }
    const batch = db.batch();
    for (const item of expiredActivity.docs) batch.delete(item.ref, { lastUpdateTime: item.updateTime });
    if (!expiredActivity.empty) await batch.commit();
  }

  return {
    pin: onDocumentCreated(trigger('pins/{pinId}'), e => e.data && pinEvent(e.data)),
    like: onDocumentCreated(trigger('pins/{pinId}/likes/{actorId}'), e => e.data && social(e.data, 'like', e.params.pinId)),
    comment: onDocumentCreated(trigger('pins/{pinId}/comments/{commentId}'), e => e.data && social(e.data, 'comment', e.params.pinId)),
    follow: onDocumentCreated(trigger('users/{uid}/followers/{followerId}'), e => e.data && social(e.data, 'follow', e.params.uid)),
    xp: onDocumentCreated(trigger('progressionV11/{uid}/xpEvents/{eventId}'), e => e.data && xpEvent(e.data, e.params.uid)),
    level: onDocumentWritten(trigger('progressionV11/{uid}/state/summary'), e =>
      e.data?.after.exists && levelEvent(e.data.before, e.data.after, e.params.uid)),
    system: onDocumentCreated(trigger('users/{uid}/notificationCommands/{id}'), e => e.data && systemEvent(e.data, e.params.uid)),
    prune,
    api: onCall({ region, maxInstances: 10 }, async request => {
      const uid = request.auth?.uid;
      if (!uid || request.auth?.token.firebase.sign_in_provider === 'anonymous' || request.auth?.token.firebase.tenant) {
        throw new HttpsError('unauthenticated', 'Sign in to continue.');
      }
      const { action, before, id } = request.data ?? {};
      if (action === 'readAll' || ((action === 'read' || action === 'delete') &&
          typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) {
        await changeInbox(uid, action, id);
        return { ok: true };
      }
      return db.runTransaction(async tx => {
        const [profile, deletion] = await tx.getAll(user(uid), lock(uid));
        if (!allowedAccount(profile, deletion)) throw new HttpsError('permission-denied', 'Activity is unavailable.');
        if (action === 'inbox' && (before === undefined || (Number.isSafeInteger(before) && before > 0))) {
          return inboxPage(tx, uid, before);
        }
        if ((action === 'mine' || action === 'following') &&
            (before === undefined || (typeof before === 'string' && /^\d{16}:[a-f0-9]{64}$/.test(before)))) {
          return activityPage(tx, uid, action === 'following', before);
        }
        throw new HttpsError('invalid-argument', 'Invalid activity request.');
      }, { readOnly: true });
    }),
  };
}
