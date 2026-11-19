"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_WINDOW_MS = exports.IMAGE_PREFIX = exports.IMAGE_PROTOCOL = void 0;
exports.matchesImageSignature = matchesImageSignature;
exports.pinImagePath = pinImagePath;
exports.handlePinImageUpload = handlePinImageUpload;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
exports.IMAGE_PROTOCOL = 'server-v1';
exports.IMAGE_PREFIX = 'pin-images-v2';
exports.UPLOAD_WINDOW_MS = 10 * 60_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 20;
const MAX_ENCODED_SIZE = Math.ceil(MAX_FILE_SIZE / 3) * 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATION = /^[1-9][0-9]{0,19}$/;
const PIN_ID = /^[A-Za-z0-9]{20}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
function invalid(message) {
    throw new https_1.HttpsError('invalid-argument', message);
}
function isImageSpec(value) {
    const spec = value;
    return !!spec && typeof spec.size === 'number' && Number.isInteger(spec.size) && spec.size > 0 && spec.size <= MAX_FILE_SIZE &&
        typeof spec.type === 'string' && MIME_TYPES.has(spec.type);
}
function matchesImageSignature(bytes, type) {
    const ascii = (from, to) => bytes.toString('latin1', from, to);
    switch (type) {
        case 'image/jpeg': return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
        case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
        case 'image/gif': return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
        case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
        default: {
            if (bytes.length < 16 || ascii(4, 8) !== 'ftyp')
                return false;
            const end = bytes.readUInt32BE(0);
            if (end < 16 || end > Math.min(bytes.length, 1024) || end % 4 !== 0)
                return false;
            const accepted = type === 'image/avif' ? ['avif', 'avis'] : ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
            if (accepted.includes(ascii(8, 12)))
                return true;
            for (let index = 16; index < end; index += 4) {
                if (accepted.includes(ascii(index, index + 4)))
                    return true;
            }
            return false;
        }
    }
}
function pinImagePath(userId, pinId, incarnation, uploadId) {
    return [exports.IMAGE_PREFIX, userId, pinId, incarnation, uploadId].join('/');
}
async function assertActiveUser(db, tx, uid) {
    const [profile, lock] = await tx.getAll(db.collection('users').doc(uid), db.collection('accountDeletionLocks').doc(uid));
    if (!profile.exists || lock.exists || profile.get('deletionStatus') === 'deleting') {
        throw new https_1.HttpsError('permission-denied', 'An active profile is required.');
    }
}
async function handlePinImageUpload(db, getBucket, auth, input) {
    if (!auth || auth.token.firebase.sign_in_provider === 'anonymous' || auth.token.firebase.tenant) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to upload pin images.');
    }
    const uid = auth.uid;
    if (!uid || uid.includes('/') || uid === '.' || uid === '..') {
        throw new https_1.HttpsError('permission-denied', 'Invalid account.');
    }
    const data = input;
    if (data?.action === 'begin') {
        const { pinId, images } = data;
        if (typeof pinId !== 'string' || !PIN_ID.test(pinId) || !Array.isArray(images) ||
            images.length < 1 || images.length > MAX_IMAGES || !images.every(isImageSpec)) {
            return invalid('Supply a pin ID and valid image sizes and types.');
        }
        const incarnation = data.incarnation ?? (0, node_crypto_1.randomUUID)();
        if (typeof incarnation !== 'string' || !UUID.test(incarnation))
            return invalid('Invalid upload authorization.');
        const uploadIds = images.map(() => (0, node_crypto_1.randomUUID)());
        const specs = images.map(({ size, type }) => ({ size, type }));
        const quota = db.collection('pinImageUploadQuotas').doc(uid);
        const globalQuota = db.collection('pinImageUploadQuotas').doc('global').collection('capacity').doc('hourly');
        const intentRef = db.collection('pinImageUploadIntents').doc(incarnation);
        return db.runTransaction(async (tx) => {
            await assertActiveUser(db, tx, uid);
            const [pin, userLimit, globalLimit, prior, cleanup] = await tx.getAll(db.collection('pins').doc(pinId), quota, globalQuota, intentRef, db.collection('pinImageCleanupJobs').doc(incarnation));
            if (prior.exists) {
                const savedSpecs = prior.get('specs');
                if (prior.get('protocol') !== exports.IMAGE_PROTOCOL || prior.get('userId') !== uid || prior.get('pinId') !== pinId ||
                    savedSpecs.length !== specs.length ||
                    specs.some((spec, i) => spec.size !== savedSpecs[i].size || spec.type !== savedSpecs[i].type)) {
                    throw new https_1.HttpsError('failed-precondition', 'Upload authorization does not match this attempt.');
                }
                if (cleanup.exists || prior.get('expiresAt').toMillis() <= Date.now()) {
                    throw new https_1.HttpsError('deadline-exceeded', 'Upload authorization expired.', { uploadExpired: true });
                }
                return { incarnation, uploadIds: prior.get('uploadIds') };
            }
            if (cleanup.exists) {
                throw new https_1.HttpsError('failed-precondition', 'Restart this image upload.', { uploadExpired: true });
            }
            if (pin.exists)
                throw new https_1.HttpsError('already-exists', 'This pin already exists.');
            const now = Date.now();
            const hour = Math.floor(now / 3_600_000);
            const userCount = (userLimit.get('hour') === hour ? userLimit.get('count') : 0) + specs.length;
            const globalCount = (globalLimit.get('hour') === hour ? globalLimit.get('count') : 0) + specs.length;
            if (userCount > 100 || globalCount > 200) {
                throw new https_1.HttpsError('resource-exhausted', 'Upload limit reached. Try again later.');
            }
            tx.set(quota, { hour, count: userCount });
            tx.set(globalQuota, { hour, count: globalCount });
            tx.create(intentRef, {
                protocol: exports.IMAGE_PROTOCOL, pinId, userId: uid, uploadIds, specs,
                createdAt: firestore_1.Timestamp.fromMillis(now), expiresAt: firestore_1.Timestamp.fromMillis(now + exports.UPLOAD_WINDOW_MS),
                cleanupAfter: firestore_1.Timestamp.fromMillis(now + 60 * 60_000),
            });
            return { incarnation, uploadIds };
        });
    }
    if (!data || typeof data.incarnation !== 'string' || !UUID.test(data.incarnation)) {
        return invalid('Invalid upload authorization.');
    }
    const incarnation = data.incarnation;
    const intent = db.collection('pinImageUploadIntents').doc(incarnation);
    const approval = db.collection('pinImageApprovals').doc(incarnation);
    const job = db.collection('pinImageCleanupJobs').doc(incarnation);
    async function openIntent(tx) {
        await assertActiveUser(db, tx, uid);
        const [snapshot, cleanup] = await tx.getAll(intent, job);
        const record = snapshot.data();
        if (record?.protocol !== exports.IMAGE_PROTOCOL || record.userId !== uid) {
            throw new https_1.HttpsError('permission-denied', 'Upload authorization is unavailable.');
        }
        if (cleanup.exists || record.expiresAt.toMillis() <= Date.now()) {
            throw new https_1.HttpsError('deadline-exceeded', 'Upload authorization expired.', { uploadExpired: true });
        }
        return { pinId: record.pinId, uploadIds: record.uploadIds,
            specs: record.specs, expiresAt: record.expiresAt };
    }
    if (data.action === 'finish') {
        return db.runTransaction(async (tx) => {
            const { pinId, uploadIds, expiresAt } = await openIntent(tx);
            const existing = await tx.get(approval);
            if (existing.exists)
                return existing.get('claim');
            const receipts = await tx.getAll(...uploadIds.map(uploadId => intent.collection('receipts').doc(uploadId)));
            if (receipts.some(receipt => !GENERATION.test(receipt.get('generation') ?? '') || !receipt.get('downloadUrl'))) {
                throw new https_1.HttpsError('failed-precondition', 'The authorized images have not all been uploaded.');
            }
            const claim = {
                protocol: exports.IMAGE_PROTOCOL, pinId, userId: uid,
                images: receipts.map(receipt => ({ uploadId: receipt.id, generation: receipt.get('generation') })),
                imageUrls: receipts.map(receipt => receipt.get('downloadUrl')),
            };
            tx.create(approval, { expiresAt, claim });
            return claim;
        });
    }
    if (data.action !== 'upload' || typeof data.uploadId !== 'string' || !UUID.test(data.uploadId) ||
        typeof data.content !== 'string' || !data.content.length || data.content.length > MAX_ENCODED_SIZE ||
        data.content.length % 4 !== 0) {
        return invalid('Invalid image upload.');
    }
    const { uploadId, content } = data;
    const receipt = intent.collection('receipts').doc(uploadId);
    const bytes = Buffer.from(content, 'base64');
    const digest = (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
    const { pinId, spec, nonce, token, completed } = await db.runTransaction(async (tx) => {
        const authorization = await openIntent(tx);
        const spec = authorization.specs[authorization.uploadIds.indexOf(uploadId)];
        if (!spec || bytes.length !== spec.size || bytes.toString('base64') !== content ||
            !matchesImageSignature(bytes, spec.type)) {
            return invalid('Image bytes do not match the authorized format or size.');
        }
        const existing = await tx.get(receipt);
        if (existing.exists) {
            const prior = existing.data();
            // An old nonce does not prove which bytes reached Storage. Never reuse the slot.
            if (prior.digest === undefined) {
                throw new https_1.HttpsError('failed-precondition', 'Restart this legacy image upload.', { uploadExpired: true });
            }
            if (prior.digest !== digest || typeof prior.token !== 'string') {
                throw new https_1.HttpsError('failed-precondition', 'This upload slot belongs to a different upload.');
            }
            return { pinId: authorization.pinId, spec, nonce: prior.nonce,
                token: prior.token, completed: !!prior.generation && !!prior.downloadUrl };
        }
        const nonce = (0, node_crypto_1.randomUUID)();
        const token = (0, node_crypto_1.randomUUID)();
        tx.create(receipt, { nonce, token, digest });
        return { pinId: authorization.pinId, spec, nonce, token, completed: false };
    });
    if (completed)
        return { uploaded: true };
    const bucket = getBucket();
    const path = pinImagePath(uid, pinId, incarnation, uploadId);
    const file = bucket.file(path);
    let metadata;
    try {
        await file.save(bytes, {
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
                contentType: spec.type,
                metadata: { protocol: exports.IMAGE_PROTOCOL, uploadedBy: uid, pinId, incarnation, uploadId, nonce, digest,
                    firebaseStorageDownloadTokens: token },
            },
        });
    }
    catch (error) {
        // The create may have succeeded before transport failure, or a same-slot retry won.
        const code = error?.code;
        if (code !== 412)
            console.warn('Pin image create unconfirmed', { pinId, incarnation, uploadId, code });
    }
    try {
        [metadata] = await file.getMetadata();
    }
    catch {
        throw new https_1.HttpsError('unavailable', 'Image storage is unconfirmed. Retry this publish attempt.');
    }
    const generation = String(metadata.generation);
    const custom = metadata.metadata;
    if (!GENERATION.test(generation) || Number(metadata.size) !== spec.size || metadata.contentType !== spec.type ||
        custom?.protocol !== exports.IMAGE_PROTOCOL || custom.nonce !== nonce || custom.uploadedBy !== uid ||
        custom.pinId !== pinId || custom.incarnation !== incarnation || custom.uploadId !== uploadId ||
        custom.digest !== digest || custom.firebaseStorageDownloadTokens !== token) {
        throw new https_1.HttpsError('failed-precondition', 'Stored image does not match the authorization.');
    }
    const downloadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name +
        '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token;
    await db.runTransaction(async (tx) => {
        await openIntent(tx);
        const current = await tx.get(receipt);
        if (current.get('nonce') !== nonce || current.get('digest') !== digest ||
            (current.get('generation') && current.get('generation') !== generation)) {
            throw new https_1.HttpsError('failed-precondition', 'Upload receipt changed.');
        }
        tx.update(receipt, { generation, downloadUrl });
    });
    return { uploaded: true };
}
//# sourceMappingURL=pinImageUpload.js.map