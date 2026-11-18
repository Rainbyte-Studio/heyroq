"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupPinImages = cleanupPinImages;
exports.resumePinImageCleanup = resumePinImageCleanup;
exports.reconcilePinImages = reconcilePinImages;
const firestore_1 = require("firebase-admin/firestore");
const pinImageUpload_1 = require("./pinImageUpload");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generationPattern = /^[1-9][0-9]{0,19}$/;
const MAX_PIN_IMAGES = 20;
const MAX_CLEANUP_ATTEMPTS = 8;
const RETRY_LEASE_MS = 5 * 60_000;
const CLAIMS_PER_SWEEP = 20;
const UPLOAD_INTENTS_PER_SWEEP = 40;
function validPinIdentity(pinId, userId) {
    return typeof userId === 'string' && !!userId && !userId.includes('/') &&
        typeof pinId === 'string' && /^[A-Za-z0-9]{20}$/.test(pinId);
}
async function cleanupPinImages(db, getBucket, deletedPin, eventId) {
    const pinId = deletedPin.id;
    const { userId, imageIncarnation, imageUrls } = deletedPin.data() ?? {};
    const unresolved = (reason) => console.warn('Unresolved pin image cleanup', { eventId, pinId, reason });
    if (!imageIncarnation) {
        if (Array.isArray(imageUrls) && imageUrls.length)
            unresolved('legacy-image-urls');
        return;
    }
    if (!validPinIdentity(pinId, userId) ||
        typeof imageIncarnation !== 'string' || !uuidPattern.test(imageIncarnation)) {
        unresolved('invalid-pin-identity');
        return;
    }
    const job = db.collection('pinImageCleanupJobs').doc(imageIncarnation);
    const claim = await db.collection('pinImageClaims').doc(imageIncarnation).get();
    const data = claim.data();
    if (data?.protocol !== pinImageUpload_1.IMAGE_PROTOCOL || !deletedPin.createTime || !claim.createTime?.isEqual(deletedPin.createTime) ||
        data.userId !== userId || data.pinId !== pinId ||
        !Array.isArray(data.images) || !data.images.length || data.images.length > MAX_PIN_IMAGES) {
        unresolved('invalid-image-claim');
        return;
    }
    await job.create({ pinId, userId, eventId, claimCreatedAt: claim.createTime, status: 'pending' })
        .catch(error => { if (error?.code !== 6)
        throw error; });
    await resumePinImageCleanup(db, getBucket, imageIncarnation);
}
// A retry uses the original claim or immutable intent receipts.
async function resumePinImageCleanup(db, getBucket, imageIncarnation) {
    if (!uuidPattern.test(imageIncarnation))
        throw new Error('Invalid image incarnation');
    const job = db.collection('pinImageCleanupJobs').doc(imageIncarnation);
    const claim = db.collection('pinImageClaims').doc(imageIncarnation);
    const intent = db.collection('pinImageUploadIntents').doc(imageIncarnation);
    const attempt = await db.runTransaction(async (transaction) => {
        const [jobSnapshot, claimSnapshot, intentSnapshot] = await transaction.getAll(job, claim, intent);
        const record = jobSnapshot.data();
        if (!record)
            throw new Error('Pin image cleanup job not found');
        const { pinId, userId, claimCreatedAt, status } = record;
        if (status !== 'pending')
            return;
        const orphan = record.source === 'upload-intent';
        const source = orphan ? intentSnapshot : claimSnapshot;
        const data = source.data();
        const entries = orphan ? data?.uploadIds : data?.images;
        if (!validPinIdentity(pinId, userId) || data?.protocol !== pinImageUpload_1.IMAGE_PROTOCOL || !(claimCreatedAt instanceof firestore_1.Timestamp) ||
            !source.createTime?.isEqual(claimCreatedAt) || data.pinId !== pinId || data.userId !== userId ||
            !Array.isArray(entries) || !entries.length || entries.length > MAX_PIN_IMAGES ||
            (orphan && claimSnapshot.exists)) {
            transaction.update(job, { status: 'unresolved', reason: 'invalid-image-claim' });
            return;
        }
        const pin = await transaction.get(db.collection('pins').doc(pinId));
        if (pin.get('imageIncarnation') === imageIncarnation)
            return;
        const now = Date.now();
        if (record.leaseUntil?.toMillis() > now)
            return;
        const attemptNumber = (record.attempts ?? 0) + 1;
        if (attemptNumber > MAX_CLEANUP_ATTEMPTS) {
            transaction.update(job, { status: 'unresolved', reason: 'retry-limit' });
            return;
        }
        transaction.update(job, {
            attempts: attemptNumber,
            leaseUntil: firestore_1.Timestamp.fromMillis(now + RETRY_LEASE_MS),
        });
        return { pinId, userId, eventId: record.eventId, entries, specs: data.specs, orphan, attemptNumber };
    });
    if (!attempt)
        return;
    const { pinId, userId, eventId, entries, specs, orphan, attemptNumber } = attempt;
    const unresolved = (reason, uploadId) => {
        console.warn('Unresolved pin image cleanup', { eventId, pinId, reason, uploadId });
        return { reason, ...(uploadId ? { uploadId } : {}) };
    };
    const results = await Promise.allSettled(entries.map(async (entry, index) => {
        const uploadId = orphan ? entry : entry?.uploadId;
        if (typeof uploadId !== 'string' || !uuidPattern.test(uploadId))
            return unresolved('invalid-upload-id');
        const receipt = orphan ? (await intent.collection('receipts').doc(uploadId).get()).data() : undefined;
        const generation = orphan ? receipt?.generation : entry?.generation;
        const hasGeneration = typeof generation === 'string' && generationPattern.test(generation);
        if (!orphan && !hasGeneration) {
            return unresolved('invalid-object-claim', uploadId);
        }
        const file = getBucket().file((0, pinImageUpload_1.pinImagePath)(userId, pinId, imageIncarnation, uploadId));
        try {
            const [metadata] = await file.getMetadata();
            const owner = metadata.metadata;
            const storedGeneration = String(metadata.generation);
            const spec = specs?.[index];
            const originalGeneration = hasGeneration ? storedGeneration === generation :
                generation === undefined && typeof receipt?.nonce === 'string' && uuidPattern.test(receipt.nonce) &&
                    owner?.nonce === receipt.nonce && String(metadata.metageneration) === '1' &&
                    Number(metadata.size) === spec?.size && metadata.contentType === spec?.type;
            if (!generationPattern.test(storedGeneration) || owner?.protocol !== pinImageUpload_1.IMAGE_PROTOCOL || !originalGeneration ||
                !owner || owner.uploadedBy !== userId ||
                owner.pinId !== pinId || owner.incarnation !== imageIncarnation || owner.uploadId !== uploadId ||
                !generationPattern.test(String(metadata.metageneration))) {
                return unresolved('object-identity-mismatch', uploadId);
            }
            await file.delete({
                ifGenerationMatch: storedGeneration,
                ifMetagenerationMatch: String(metadata.metageneration),
            });
        }
        catch (error) {
            const code = error?.code;
            if (code === 404)
                return undefined;
            if (code === 412) {
                return unresolved('object-precondition-failed', uploadId);
            }
            throw error;
        }
        return undefined;
    }));
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    const unresolvedObjects = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(job);
        if (current.get('status') !== 'pending' || current.get('attempts') !== attemptNumber)
            return;
        transaction.update(job, {
            leaseUntil: firestore_1.FieldValue.delete(),
            ...(!failures.length ? { status: 'complete', completedAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            ...(unresolvedObjects.length ? { unresolved: firestore_1.FieldValue.arrayUnion(...unresolvedObjects) } : {}),
        });
    });
    if (failures.length)
        throw new AggregateError(failures, 'Pin image cleanup failed for event ' + eventId);
}
async function reconcilePinImages(db, getBucket) {
    // Independent sweeps keep a failure in one queue from blocking the other.
    const results = await Promise.allSettled([sweepClaims(db, getBucket), sweepExpiredUploads(db, getBucket)]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length)
        throw new AggregateError(failures, 'Pin image reconciliation failed');
}
async function sweepClaims(db, getBucket) {
    const cursor = db.collection('pinImageCleanupState').doc('claims');
    const position = await cursor.get();
    const after = position.get('after');
    const ordered = db.collection('pinImageClaims')
        .orderBy(firestore_1.FieldPath.documentId()).limit(CLAIMS_PER_SWEEP);
    const page = await (after ? ordered.startAfter(after) : ordered).get();
    await Promise.all(page.docs.map(async (source) => {
        try {
            const { pinId, userId, protocol } = source.data();
            if (protocol !== pinImageUpload_1.IMAGE_PROTOCOL || !uuidPattern.test(source.id) || !validPinIdentity(pinId, userId))
                return;
            const job = db.collection('pinImageCleanupJobs').doc(source.id);
            const pin = db.collection('pins').doc(pinId);
            const pending = await db.runTransaction(async (transaction) => {
                const [current, existing] = await transaction.getAll(pin, job);
                if (current.get('imageIncarnation') === source.id)
                    return false;
                if (existing.exists)
                    return existing.get('status') === 'pending';
                transaction.create(job, {
                    pinId, userId, eventId: 'reconciliation', claimCreatedAt: source.createTime, status: 'pending',
                });
                return true;
            });
            if (pending)
                await resumePinImageCleanup(db, getBucket, source.id);
        }
        catch (error) {
            console.error('Pin image reconciliation failed', { incarnation: source.id, error });
        }
    }));
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(cursor);
        if (position.exists ? !current.updateTime?.isEqual(position.updateTime) : current.exists)
            return;
        transaction.set(cursor, { after: page.size === CLAIMS_PER_SWEEP ? page.docs.at(-1).id : null });
    });
}
async function sweepExpiredUploads(db, getBucket) {
    const page = await db.collection('pinImageUploadIntents')
        .where('cleanupAfter', '<=', firestore_1.Timestamp.now()).orderBy('cleanupAfter').orderBy(firestore_1.FieldPath.documentId())
        .limit(UPLOAD_INTENTS_PER_SWEEP).get();
    await Promise.all(page.docs.map(async (source) => {
        const { pinId, userId, protocol } = source.data();
        if (protocol !== pinImageUpload_1.IMAGE_PROTOCOL || !uuidPattern.test(source.id) || !validPinIdentity(pinId, userId))
            return;
        const job = db.collection('pinImageCleanupJobs').doc(source.id);
        const claim = db.collection('pinImageClaims').doc(source.id);
        try {
            const pending = await db.runTransaction(async (tx) => {
                const [existing, published] = await tx.getAll(job, claim);
                if (published.exists || (existing.exists && existing.get('status') !== 'pending')) {
                    tx.update(source.ref, { cleanupAfter: firestore_1.FieldValue.delete() });
                    return false;
                }
                if (!existing.exists) {
                    tx.create(job, { pinId, userId, eventId: 'reconciliation', claimCreatedAt: source.createTime,
                        status: 'pending', source: 'upload-intent' });
                }
                return true;
            });
            if (pending)
                await resumePinImageCleanup(db, getBucket, source.id);
        }
        catch (error) {
            console.error('Pin image orphan reconciliation failed', { incarnation: source.id, error });
        }
    }));
}
//# sourceMappingURL=pinImageCleanup.js.map