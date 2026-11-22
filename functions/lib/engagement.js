"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferenceDefaults = void 0;
exports.validDocumentId = validDocumentId;
exports.isPublicPin = isPublicPin;
exports.preferenceEnabled = preferenceEnabled;
exports.shareActivity = shareActivity;
exports.mapXp = mapXp;
exports.buildEngagement = buildEngagement;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const logger_1 = require("firebase-functions/logger");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const geographicProgression_1 = require("./geographicProgression");
const DAY = 86_400_000;
const HISTORY_DAYS = 90;
const PAGE_SIZE = 24;
const FOLLOW_LIMIT = 90;
const privateCollection = 'activityV1';
exports.preferenceDefaults = {
    likes: true, comments: true, replies: true, follows: true,
    achievements: true, levels: true, geography: true, announcements: true,
    shareActivity: false, shareAchievements: false, shareGeography: false,
};
function validDocumentId(value) {
    return typeof value === 'string' && value.length <= 160 && /^[a-zA-Z0-9_:-]+$/.test(value);
}
function isPublicPin(pin) {
    return pin.exists && !pin.get('isDeleted') && !pin.get('isPrivate') && !pin.get('isReported') &&
        !pin.get('isDemo') && pin.get('publicAccess') === true &&
        pin.get('visibility') === 'public' && pin.get('status') === 'published';
}
function preferenceEnabled(data, key) {
    const value = data?.[key];
    return typeof value === 'boolean' ? value : exports.preferenceDefaults[key];
}
function shareActivity(data, type) {
    if (!preferenceEnabled(data, 'shareActivity'))
        return false;
    if (type === 'pin')
        return true;
    if (type === 'achievement')
        return preferenceEnabled(data, 'shareAchievements');
    if (type === 'city' || type === 'country')
        return preferenceEnabled(data, 'shareGeography');
    return false;
}
const noticePreference = {
    like: 'likes', comment: 'comments', reply: 'replies', follow: 'follows',
    achievement: 'achievements', level: 'levels', geography: 'geography',
    announcement: 'announcements', account: null,
};
const hash = (key) => (0, node_crypto_1.createHash)('sha256').update(key).digest('hex');
const sortKey = (at, id) => String(Math.floor(at.toMillis())).padStart(16, '0') + ':' + id;
const incarnation = (at) => at.seconds + ':' + at.nanoseconds;
const safeCount = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
function readDocuments(tx) {
    const reads = new Map();
    return (ref) => {
        const existing = reads.get(ref.path);
        if (existing)
            return existing;
        const pending = tx.get(ref);
        reads.set(ref.path, pending);
        return pending;
    };
}
function allowedAccount(user, lock) {
    return user.exists && !lock.exists && user.get('deletionStatus') !== 'deleting';
}
function declaredCutoff(control) {
    const start = control.get('progressionStartsAtMs');
    return control.get('schemaVersion') === 1 && control.get('mode') === 'running' &&
        control.get('generation') === 'progressionV11' && Number.isSafeInteger(start) && start > 0
        ? Number(start) : Infinity;
}
function mapXp(event) {
    const xp = event.get('xpEarned');
    const action = event.get('action');
    const reference = event.get('referenceId');
    const source = event.ref.path;
    if (!Number.isSafeInteger(xp) || xp < 0 || !validDocumentId(reference))
        return;
    if (action === 'ACHIEVEMENT_UNLOCKED') {
        if (event.id === 'achievement:' + reference)
            return { type: 'achievement', achievementId: reference, source, xp };
        return;
    }
    const receipt = event.get('geographicReceipt');
    if (receipt?.schemaVersion === 2 && validDocumentId(receipt.pinId)) {
        if (action === 'UNIQUE_CITY' && reference === receipt.countryCode + ':' + receipt.cityId &&
            event.id === 'geo_v1:city:' + reference && (0, geographicProgression_1.formatGeographicDiscovery)(receipt, true)) {
            return { type: 'city', pinId: receipt.pinId, source, xp };
        }
        if (action === 'UNIQUE_COUNTRY' && reference === receipt.countryCode &&
            event.id === 'geo_v1:country:' + reference && (0, geographicProgression_1.formatGeographicDiscovery)(receipt, false)) {
            return { type: 'country', pinId: receipt.pinId, source, xp };
        }
    }
    if (xp === 0)
        return;
    if (['PIN_CREATED', 'RICH_DISCOVERY', 'FIRST_DISCOVERY'].includes(action))
        return { type: 'xp', source, xp, pinId: reference };
    if (['LIKE_MILESTONE', 'FOLLOWER_MILESTONE'].includes(action))
        return { type: 'xp', source, xp };
    return undefined;
}
function buildEngagement(db, database, region) {
    const user = (uid) => db.collection('users').doc(uid);
    const lock = (uid) => db.collection('accountDeletionLocks').doc(uid);
    const prefs = (uid) => user(uid).collection('notificationPreferences').doc('settings');
    const state = (uid) => user(uid).collection('notificationState').doc('inbox');
    const inbox = (uid) => user(uid).collection('notifications');
    const activity = (uid) => user(uid).collection(privateCollection);
    const pins = db.collection('pins');
    const control = db.doc('progressionMaintenance/writers');
    const generation = db.collection('progressionV11');
    const trigger = (document) => ({ document, database, region, retry: true });
    async function project(tx, uid, eventKey, at, item, notice) {
        const id = hash(eventKey);
        const noticeRef = inbox(uid).doc(notice?.noticeId ? hash(notice.noticeId) : id);
        const stateRef = state(uid);
        const activityRef = activity(uid).doc(id);
        const [profile, deletion, noticeReads, previousActivity] = await Promise.all([
            tx.get(user(uid)), tx.get(lock(uid)),
            notice ? tx.getAll(prefs(uid), noticeRef, stateRef) : undefined,
            item ? tx.get(activityRef) : undefined,
        ]);
        if (!allowedAccount(profile, deletion))
            return 'recipient_ineligible';
        if (item && !previousActivity?.exists) {
            tx.create(activityRef, {
                ...item, actorId: uid, schemaVersion: 1, at, key: sortKey(at, id),
                eligible: ['pin', 'city', 'country', 'achievement'].includes(item.type),
                expiresAt: firestore_1.Timestamp.fromMillis(at.toMillis() + HISTORY_DAYS * DAY),
            });
        }
        if (!notice || !noticeReads)
            return;
        if (notice.actorId === uid)
            return 'self_follow';
        const [settings, previousNotice, inboxState] = noticeReads;
        if (previousNotice.exists)
            return 'duplicate_or_tombstone';
        const preference = noticePreference[notice.type];
        // A suppressed event gets a tombstone, so replay after a preference change cannot deliver it.
        const expiresAt = firestore_1.Timestamp.fromMillis(at.toMillis() + HISTORY_DAYS * DAY);
        if (preference && !preferenceEnabled(settings.data(), preference)) {
            tx.create(noticeRef, { expiresAt, deleted: true });
            return 'preference_disabled';
        }
        const sequence = safeCount(inboxState.get('sequence')) + 1;
        const { noticeId: _noticeId, ...fields } = notice;
        tx.create(noticeRef, {
            ...fields, recipientId: uid, sequence, at, deleted: false, read: false, expiresAt,
            category: ['like', 'comment', 'reply', 'follow'].includes(notice.type) ? 'social'
                : ['announcement', 'account'].includes(notice.type) ? 'system' : 'progression',
            schemaVersion: 1,
        });
        tx.set(stateRef, { sequence, unread: safeCount(inboxState.get('unread')) + 1,
            revision: safeCount(inboxState.get('revision')) + 1 }, { merge: true });
        return 'delivered';
    }
    function fresh(at) {
        return at.toMillis() > Date.now() - 7 * DAY;
    }
    async function pinEvent(event) {
        const at = event.createTime;
        if (!at || !fresh(at))
            return;
        await db.runTransaction(async (tx) => {
            const pin = await tx.get(event.ref);
            const uid = pin.get('userId');
            if (!validDocumentId(uid) || !isPublicPin(pin) || !pin.createTime?.isEqual(at))
                return;
            const receipt = await tx.get(user(uid).collection('pinPublishReceipts').doc(pin.id));
            if (!receipt.createTime?.isEqual(at))
                return;
            await project(tx, uid, 'pin:' + pin.id + ':' + incarnation(at), at, {
                type: 'pin', source: pin.ref.path, pinId: pin.id, pinCreatedAt: at,
            });
        });
    }
    async function social(event, type, parentId) {
        const at = event.createTime;
        if (!at)
            return 'missing_create_time';
        if (type === 'follow' && !Number.isFinite(at.toMillis()))
            return 'invalid_create_time';
        if (!fresh(at))
            return 'expired_event';
        return db.runTransaction(async (tx) => {
            const current = await tx.get(event.ref);
            if (!current.exists)
                return 'follow_document_missing';
            if (!current.createTime?.isEqual(at))
                return 'create_time_mismatch';
            const actorId = type === 'comment' ? current.get('userId') : current.id;
            if (!validDocumentId(actorId))
                return 'invalid_actor';
            const [actor, actorLock] = await tx.getAll(user(actorId), lock(actorId));
            if (!allowedAccount(actor, actorLock))
                return 'actor_ineligible';
            const eventKey = type + ':' + event.ref.path + ':' + incarnation(at);
            if (type === 'follow') {
                const following = await tx.get(user(actorId).collection('following').doc(parentId));
                if (!following.exists)
                    return 'reciprocal_document_missing';
                return project(tx, parentId, eventKey, at, undefined, {
                    type, actorId, noticeId: 'follow:' + event.ref.path + ':' + Math.floor(at.toMillis() / DAY),
                });
            }
            const pin = await tx.get(pins.doc(parentId));
            if (!isPublicPin(pin) || !pin.createTime || pin.createTime.valueOf() > at.valueOf())
                return;
            const parentCommentId = type === 'comment' ? current.get('parentCommentId') : undefined;
            const parent = validDocumentId(parentCommentId)
                ? await tx.get(pin.ref.collection('comments').doc(parentCommentId)) : undefined;
            if (parentCommentId !== undefined && (!parent?.createTime || parent.get('parentCommentId') ||
                parent.createTime.valueOf() > at.valueOf()))
                return;
            const recipient = parent ? parent.get('userId') : pin.get('userId');
            if (!validDocumentId(recipient) || recipient === actorId)
                return;
            await project(tx, recipient, eventKey, at, undefined, {
                type: parent ? 'reply' : type, actorId, pinId: pin.id, pinCreatedAt: pin.createTime,
                ...(type === 'like' ? {
                    noticeId: 'like:' + event.ref.path + ':' + incarnation(pin.createTime) + ':' + Math.floor(at.toMillis() / DAY),
                } : { commentId: current.id, commentCreatedAt: at }),
                ...(parent?.createTime ? { parentCommentId: parent.id, parentCommentCreatedAt: parent.createTime } : {}),
            });
            return undefined;
        });
    }
    async function xpEvent(event, uid) {
        const at = event.createTime;
        if (!at || !fresh(at) || event.ref.parent.path !== generation.doc(uid).collection('xpEvents').path)
            return;
        await db.runTransaction(async (tx) => {
            const [config, current] = await tx.getAll(control, event.ref);
            if (at.toMillis() < declaredCutoff(config) || !current.createTime?.isEqual(at) ||
                current.get('userId') !== uid)
                return;
            const item = mapXp(current);
            if (!item)
                return;
            let notice;
            if (item.type === 'achievement' && item.achievementId) {
                const earned = await tx.get(generation.doc(uid).collection('achievements').doc(item.achievementId));
                if (earned.get('isUnlocked') !== true)
                    return;
                notice = { type: 'achievement', achievementId: item.achievementId, source: item.source };
            }
            if (item.pinId) {
                const pin = await tx.get(pins.doc(item.pinId));
                if (isPublicPin(pin) && pin.get('userId') === uid && pin.createTime && pin.createTime.valueOf() <= at.valueOf()) {
                    Object.assign(item, { pinCreatedAt: pin.createTime });
                    if (item.type === 'city' || item.type === 'country') {
                        const geoStart = config.get('geographyStartsAtMs');
                        if (!Number.isSafeInteger(geoStart) || geoStart < declaredCutoff(config) || pin.createTime.toMillis() < geoStart)
                            return;
                        notice = { type: 'geography', pinId: item.pinId, pinCreatedAt: pin.createTime, source: item.source,
                            noticeId: 'geo:' + item.pinId + ':' + incarnation(pin.createTime) };
                    }
                }
                else if (item.type === 'city' || item.type === 'country')
                    return;
            }
            await project(tx, uid, 'xp:' + event.ref.path + ':' + incarnation(at), at, item, notice);
        });
    }
    async function levelEvent(before, after, uid) {
        const at = after.updateTime;
        const level = after.get('level');
        const prior = before.get('level') ?? 1;
        if (!at || !fresh(at) || !Number.isSafeInteger(level) || level <= prior)
            return;
        await db.runTransaction(async (tx) => {
            const [config, summary] = await tx.getAll(control, after.ref);
            const cutoff = declaredCutoff(config);
            if (at.toMillis() < cutoff || safeCount(summary.get('level')) < level || !summary.exists)
                return;
            await project(tx, uid, 'level:' + cutoff + ':' + level, at, { type: 'level', level, source: after.ref.path }, { type: 'level', level, source: after.ref.path });
        });
    }
    async function systemEvent(event, uid) {
        const at = event.createTime;
        if (!at || !fresh(at))
            return;
        await db.runTransaction(async (tx) => {
            const current = await tx.get(event.ref);
            const type = current.get('type');
            const title = current.get('title');
            if (!current.createTime?.isEqual(at))
                return;
            if ((type === 'announcement' || type === 'account') && typeof title === 'string' && title.trim() && title.length <= 180) {
                await project(tx, uid, 'system:' + event.ref.path, at, undefined, { type, title: title.trim() });
            }
            tx.delete(current.ref);
        });
    }
    async function changeInbox(uid, action, id) {
        return db.runTransaction(async (tx) => {
            const [profile, deletion, summary] = await tx.getAll(user(uid), lock(uid), state(uid));
            const active = allowedAccount(profile, deletion);
            if (!active && action !== 'expire')
                throw new https_1.HttpsError('permission-denied', 'Inbox is unavailable.');
            const inboxState = summary.data() ?? {};
            const unread = safeCount(inboxState.unread);
            const readThrough = safeCount(inboxState.readThrough);
            const revision = safeCount(inboxState.revision) + 1;
            if (action === 'readAll') {
                if (unread)
                    tx.set(summary.ref, { unread: 0, readThrough: inboxState.sequence, revision }, { merge: true });
                return;
            }
            if (!id)
                return;
            const item = await tx.get(inbox(uid).doc(id));
            if (!item.exists)
                return;
            const wasUnread = !item.get('deleted') && !item.get('read') && item.get('sequence') > readThrough;
            if (action === 'expire') {
                if (item.get('expiresAt')?.toMillis() > Date.now())
                    return;
                tx.delete(item.ref);
                if (!active || item.get('deleted'))
                    return;
            }
            else {
                if (item.get('deleted') || (action === 'read' && !wasUnread))
                    return;
                if (action === 'delete')
                    tx.set(item.ref, { deleted: true, expiresAt: item.get('expiresAt') });
                else
                    tx.update(item.ref, { read: true });
            }
            tx.set(summary.ref, { unread: Math.max(0, unread - Number(wasUnread)), revision }, { merge: true });
        });
    }
    async function activePin(read, entry, uid) {
        const id = entry.get('pinId');
        const incarnation = entry.get('pinCreatedAt');
        if (!validDocumentId(id) || !(incarnation instanceof firestore_1.Timestamp))
            return;
        const pin = await read(pins.doc(id));
        if (!isPublicPin(pin) || !pin.createTime?.isEqual(incarnation) || (uid && pin.get('userId') !== uid))
            return;
        const owner = pin.get('userId');
        if (!validDocumentId(owner))
            return;
        const [ownerProfile, deletion] = await Promise.all([read(user(owner)), read(lock(owner))]);
        return allowedAccount(ownerProfile, deletion) ? pin : undefined;
    }
    const label = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 180) : fallback;
    const avatar = (profile) => {
        const value = profile.get('avatarUrl') || profile.get('photoURL');
        return typeof value === 'string' && value.length <= 1200 ? value : '';
    };
    async function inboxPage(tx, read, uid, before) {
        const q = inbox(uid).where('deleted', '==', false).orderBy('sequence', 'desc').limit(PAGE_SIZE);
        const [summary, page, config] = await Promise.all([
            tx.get(state(uid)), tx.get(before ? q.startAfter(before) : q), tx.get(control),
        ]);
        const readThrough = safeCount(summary.get('readThrough'));
        const cutoff = declaredCutoff(config);
        const items = await Promise.all(page.docs.map(async (entry) => {
            const actor = entry.get('actorId');
            const isSocial = entry.get('category') === 'social';
            const [profile, deletion] = validDocumentId(actor) ? await Promise.all([read(user(actor)), read(lock(actor))]) : [];
            const hasActor = Boolean(profile && deletion && allowedAccount(profile, deletion));
            const pin = await activePin(read, entry);
            const achievementId = entry.get('achievementId');
            const earned = validDocumentId(achievementId)
                ? await read(generation.doc(uid).collection('achievements').doc(achievementId)) : undefined;
            const sourcePath = entry.get('source');
            const source = typeof sourcePath === 'string' ? await read(db.doc(sourcePath)) : undefined;
            const at = entry.get('at');
            const validProgression = entry.get('category') !== 'progression' ||
                (at.toMillis() >= cutoff && source?.exists &&
                    (entry.get('type') === 'level' ? source.get('level') >= entry.get('level')
                        : source.createTime?.isEqual(at)));
            const commentId = entry.get('commentId');
            const parentCommentId = entry.get('parentCommentId');
            const comments = pin?.ref.collection('comments');
            const [comment, parent] = comments ? await Promise.all([
                validDocumentId(commentId) ? read(comments.doc(commentId)) : undefined,
                validDocumentId(parentCommentId) ? read(comments.doc(parentCommentId)) : undefined,
            ]) : [];
            const unavailable = !validProgression || (isSocial && !hasActor) || (Boolean(entry.get('pinId')) && !pin) ||
                (Boolean(commentId) && (!comment?.createTime?.isEqual(entry.get('commentCreatedAt')) || comment.get('userId') !== actor)) ||
                (Boolean(parentCommentId) && (!parent?.createTime?.isEqual(entry.get('parentCommentCreatedAt')) || parent.get('userId') !== uid)) ||
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
    async function activityPage(tx, read, uid, following, before) {
        const [config, relationships] = await Promise.all([
            tx.get(control),
            following ? tx.get(user(uid).collection('following').orderBy('createdAt', 'desc').limit(FOLLOW_LIMIT + 1)) : undefined,
        ]);
        const candidates = relationships?.docs.slice(0, FOLLOW_LIMIT).map(doc => doc.id) ?? [];
        const sharing = new Map();
        if (candidates.length) {
            const settings = await tx.getAll(...candidates.map(prefs));
            const optedIn = settings.filter(setting => preferenceEnabled(setting.data(), 'shareActivity'));
            const reciprocal = optedIn.length ? await tx.getAll(...optedIn.map(setting => setting.ref.parent.parent.collection('followers').doc(uid))) : [];
            for (const [index, setting] of optedIn.entries()) {
                const data = setting.data();
                if (data && reciprocal[index]?.exists)
                    sharing.set(setting.ref.parent.parent.id, data);
            }
        }
        const actors = following ? [...sharing.keys()] : [uid];
        const chunks = Array.from({ length: Math.ceil(actors.length / 30) }, (_, i) => actors.slice(i * 30, i * 30 + 30));
        const cutoff = declaredCutoff(config);
        async function present(entry) {
            const actorId = entry.get('actorId');
            const type = entry.get('type');
            const at = entry.get('at').toMillis();
            if (at <= Date.now() - HISTORY_DAYS * DAY || (type !== 'pin' && at < cutoff))
                return;
            if (following && !shareActivity(sharing.get(actorId), type))
                return;
            const [profile, deletion] = await Promise.all([read(user(actorId)), read(lock(actorId))]);
            if (!allowedAccount(profile, deletion))
                return;
            const pin = await activePin(read, entry, actorId);
            const geography = type === 'city' || type === 'country';
            if ((type === 'pin' || geography) && !pin)
                return;
            const source = type === 'pin' ? pin : await read(db.doc(entry.get('source')));
            if (!source?.exists || (type !== 'pin' && type !== 'level' &&
                (!source.createTime?.isEqual(entry.get('at')) || source.get('userId') !== actorId)))
                return;
            if (type === 'level' && safeCount(source.get('level')) < entry.get('level'))
                return;
            const aid = entry.get('achievementId');
            const achievement = validDocumentId(aid)
                ? await read(generation.doc(actorId).collection('achievements').doc(aid)) : undefined;
            if (type === 'achievement' && (achievement?.get('isUnlocked') !== true ||
                (following && !['gold', 'platinum'].includes(achievement.get('tier')))))
                return;
            return {
                id: entry.id, actorId, type, at, name: label(profile.get('displayName'), 'Explorer'), avatar: avatar(profile),
                ...(pin ? { pinId: pin.id, title: label(pin.get('title'), 'Spot') } : {}),
                ...(geography ? { title: (0, geographicProgression_1.formatGeographicDiscovery)(source.get('geographicReceipt'), type === 'city') ?? '' } : {}),
                ...(achievement ? { achievementId: aid, title: label(achievement.get('title')) } : {}),
                ...(!following ? { xp: entry.get('xp') ?? null, level: entry.get('level') ?? null } : {}),
            };
        }
        const items = [];
        let scanAfter = before;
        let lastVisibleKey = null;
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
                if (!row)
                    continue;
                items.push(row);
                lastVisibleKey = window[index].get('key');
                if (items.length === PAGE_SIZE)
                    break;
            }
            if (window.length < PAGE_SIZE)
                break;
            scanAfter = window.at(-1)?.get('key');
        }
        return { items, next: items.length === PAGE_SIZE ? lastVisibleKey : null, limited: (relationships?.size ?? 0) > FOLLOW_LIMIT };
    }
    async function prune() {
        const now = firestore_1.Timestamp.now();
        const [expiredNotices, expiredActivity] = await Promise.all([
            db.collectionGroup('notifications').where('expiresAt', '<=', now).limit(150).get(),
            db.collectionGroup(privateCollection).where('expiresAt', '<=', now).limit(150).get(),
        ]);
        // Expiration and read mutations share the same transaction/cardinality invariant.
        for (let offset = 0; offset < expiredNotices.size; offset += 10) {
            await Promise.all(expiredNotices.docs.slice(offset, offset + 10).map(item => changeInbox(item.ref.parent.parent.id, 'expire', item.id)));
        }
        // Account cleanup may delete a candidate after the scan. Treat a missing or
        // changed document independently so it cannot roll back the entire page.
        for (let offset = 0; offset < expiredActivity.size; offset += 10) {
            await Promise.all(expiredActivity.docs.slice(offset, offset + 10).map(async (item) => {
                try {
                    await item.ref.delete({ lastUpdateTime: item.updateTime });
                }
                catch (error) {
                    if (![5, 9].includes(error.code ?? 0))
                        throw error;
                }
            }));
        }
    }
    return {
        pin: (0, firestore_2.onDocumentCreated)(trigger('pins/{pinId}'), e => e.data && pinEvent(e.data)),
        like: (0, firestore_2.onDocumentCreated)(trigger('pins/{pinId}/likes/{actorId}'), e => e.data && social(e.data, 'like', e.params.pinId)),
        comment: (0, firestore_2.onDocumentCreated)(trigger('pins/{pinId}/comments/{commentId}'), e => e.data && social(e.data, 'comment', e.params.pinId)),
        follow: (0, firestore_2.onDocumentCreated)(trigger('users/{uid}/followers/{followerId}'), async (event) => {
            const eventKey = event.id ? hash(event.id) : undefined;
            let reason;
            try {
                reason = event.data ? await social(event.data, 'follow', event.params.uid) : 'missing_snapshot';
            }
            catch {
                (0, logger_1.info)('Follow notification outcome', { reason: 'transaction_failure', eventKey });
                // Preserve Eventarc retries without emitting Firestore error details or document paths.
                throw new Error('Follow notification transaction failed');
            }
            // Log once after the transaction settles, including when Firestore retries the callback.
            (0, logger_1.info)('Follow notification outcome', { reason, eventKey });
        }),
        xp: (0, firestore_2.onDocumentCreated)(trigger('progressionV11/{uid}/xpEvents/{eventId}'), e => e.data && xpEvent(e.data, e.params.uid)),
        level: (0, firestore_2.onDocumentWritten)(trigger('progressionV11/{uid}/state/summary'), e => e.data?.after.exists && levelEvent(e.data.before, e.data.after, e.params.uid)),
        system: (0, firestore_2.onDocumentCreated)(trigger('users/{uid}/notificationCommands/{id}'), e => e.data && systemEvent(e.data, e.params.uid)),
        prune,
        api: (0, https_1.onCall)({ region, maxInstances: 10 }, async (request) => {
            const uid = request.auth?.uid;
            const identity = request.auth?.token.firebase;
            if (!uid || !identity?.sign_in_provider || identity.sign_in_provider === 'anonymous' || identity.tenant) {
                throw new https_1.HttpsError('unauthenticated', 'Sign in to continue.');
            }
            const data = request.data;
            if (!data || typeof data !== 'object' || Array.isArray(data))
                throw new https_1.HttpsError('invalid-argument', 'Invalid activity request.');
            const { action, before, id } = data;
            const fields = Object.keys(data).length;
            if ((action === 'readAll' && fields === 1) || ((action === 'read' || action === 'delete') && fields === 2 &&
                typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) {
                await changeInbox(uid, action, id);
                return { ok: true };
            }
            const query = (fields === 1 || (fields === 2 && Object.hasOwn(data, 'before'))) &&
                ((action === 'inbox' && (before === undefined || (Number.isSafeInteger(before) && before > 0))) ||
                    ((action === 'mine' || action === 'following') &&
                        (before === undefined || (typeof before === 'string' && /^\d{16}:[a-f0-9]{64}$/.test(before)))));
            if (!query)
                throw new https_1.HttpsError('invalid-argument', 'Invalid activity request.');
            return db.runTransaction(async (tx) => {
                const read = readDocuments(tx);
                const [profile, deletion] = await Promise.all([read(user(uid)), read(lock(uid))]);
                if (!allowedAccount(profile, deletion))
                    throw new https_1.HttpsError('permission-denied', 'Activity is unavailable.');
                return action === 'inbox' ? inboxPage(tx, read, uid, before) : activityPage(tx, read, uid, action === 'following', before);
            }, { readOnly: true });
        }),
    };
}
//# sourceMappingURL=engagement.js.map