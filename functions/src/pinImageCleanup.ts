import { FieldPath, FieldValue, Timestamp, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generationPattern = /^[1-9][0-9]{0,19}$/;
const MAX_PIN_IMAGES = 20;
const MAX_CLEANUP_ATTEMPTS = 8;
const RETRY_LEASE_MS = 5 * 60_000;
const CLAIMS_PER_SWEEP = 20;
const UPLOAD_INTENT_MS = 60 * 60_000;

function validPinIdentity(pinId: unknown, userId: unknown): pinId is string {
  return typeof userId === 'string' && !!userId && !userId.includes('/') &&
    typeof pinId === 'string' && /^[A-Za-z0-9]{20}$/.test(pinId);
}

export async function cleanupPinImages(
  db: Firestore,
  getBucket: () => Bucket,
  deletedPin: DocumentSnapshot,
  eventId: string,
): Promise<void> {
  const pinId = deletedPin.id;
  const { userId, imageIncarnation, imageUrls } = deletedPin.data() ?? {};
  const unresolved = (reason: string) =>
    console.warn('Unresolved pin image cleanup', { eventId, pinId, reason });

  if (!imageIncarnation) {
    if (Array.isArray(imageUrls) && imageUrls.length) unresolved('legacy-image-urls');
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
  if (!data || !deletedPin.createTime || !claim.createTime?.isEqual(deletedPin.createTime) ||
      data.userId !== userId || data.pinId !== pinId ||
      !Array.isArray(data.images) || !data.images.length || data.images.length > MAX_PIN_IMAGES) {
    unresolved('invalid-image-claim');
    return;
  }

  await job.create({ pinId, userId, eventId, claimCreatedAt: claim.createTime, status: 'pending' })
    .catch(error => { if (error?.code !== 6) throw error; });
  await resumePinImageCleanup(db, getBucket, imageIncarnation);
}

// A retry uses the original claim or immutable intent receipts.
export async function resumePinImageCleanup(
  db: Firestore, getBucket: () => Bucket, imageIncarnation: string,
): Promise<void> {
  if (!uuidPattern.test(imageIncarnation)) throw new Error('Invalid image incarnation');
  const job = db.collection('pinImageCleanupJobs').doc(imageIncarnation);
  const claim = db.collection('pinImageClaims').doc(imageIncarnation);
  const intent = db.collection('pinImageUploadIntents').doc(imageIncarnation);
  const attempt = await db.runTransaction(async transaction => {
    const [jobSnapshot, claimSnapshot, intentSnapshot] = await transaction.getAll(job, claim, intent);
    const record = jobSnapshot.data();
    if (!record) throw new Error('Pin image cleanup job not found');
    const { pinId, userId, claimCreatedAt, status } = record;
    if (status !== 'pending') return;
    const orphan = record.source === 'upload-intent';
    const source = orphan ? intentSnapshot : claimSnapshot;
    const data = source.data();
    const entries = orphan ? data?.uploadIds : data?.images;
    if (!validPinIdentity(pinId, userId) || !data || !(claimCreatedAt instanceof Timestamp) ||
        !source.createTime?.isEqual(claimCreatedAt) || data.pinId !== pinId || data.userId !== userId ||
        !Array.isArray(entries) || !entries.length || entries.length > MAX_PIN_IMAGES ||
        (orphan && claimSnapshot.exists)) {
      transaction.update(job, { status: 'unresolved', reason: 'invalid-image-claim' });
      return;
    }
    const pin = await transaction.get(db.collection('pins').doc(pinId));
    if (pin.get('imageIncarnation') === imageIncarnation) return;
    const now = Date.now();
    if (record.leaseUntil?.toMillis() > now) return;
    const attemptNumber = (record.attempts ?? 0) + 1;
    if (attemptNumber > MAX_CLEANUP_ATTEMPTS) {
      transaction.update(job, { status: 'unresolved', reason: 'retry-limit' });
      return;
    }
    transaction.update(job, {
      attempts: attemptNumber,
      leaseUntil: Timestamp.fromMillis(now + RETRY_LEASE_MS),
    });
    return { pinId, userId, eventId: record.eventId, entries, orphan, attemptNumber };
  });
  if (!attempt) return;
  const { pinId, userId, eventId, entries, orphan, attemptNumber } = attempt;

  const unresolved = (reason: string, uploadId?: string) => {
    console.warn('Unresolved pin image cleanup', { eventId, pinId, reason, uploadId });
    return { reason, ...(uploadId ? { uploadId } : {}) };
  };
  const results = await Promise.allSettled(entries.map(async entry => {
    const uploadId = orphan ? entry : entry?.uploadId;
    if (typeof uploadId !== 'string' || !uuidPattern.test(uploadId)) return unresolved('invalid-upload-id');
    const generation = orphan
      ? (await intent.collection('receipts').doc(uploadId).get()).get('generation')
      : entry?.generation;
    if (typeof generation !== 'string' || !generationPattern.test(generation)) {
      return unresolved(orphan ? 'missing-upload-generation' : 'invalid-object-claim', uploadId);
    }

    const path = 'pin-images/' + userId + '/' + pinId + '/' + imageIncarnation + '/' + uploadId;
    const file = getBucket().file(path);
    try {
      const [metadata] = await file.getMetadata();
      const owner = metadata.metadata;
      if (String(metadata.generation) !== generation || !owner || owner.uploadedBy !== userId ||
          owner.pinId !== pinId || owner.incarnation !== imageIncarnation || owner.uploadId !== uploadId ||
          !generationPattern.test(String(metadata.metageneration))) {
        return unresolved('object-identity-mismatch', uploadId);
      }

      await file.delete({
        ifGenerationMatch: generation,
        ifMetagenerationMatch: String(metadata.metageneration),
      });
    } catch (error) {
      const code = (error as { code?: number } | null)?.code;
      if (code === 404) return undefined;
      if (code === 412) {
        return unresolved('object-precondition-failed', uploadId);
      }
      throw error;
    }
    return undefined;
  }));

  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
  const unresolvedObjects = results.flatMap(result =>
    result.status === 'fulfilled' && result.value ? [result.value] : []);
  await db.runTransaction(async transaction => {
    const current = await transaction.get(job);
    if (current.get('status') !== 'pending' || current.get('attempts') !== attemptNumber) return;
    transaction.update(job, {
      leaseUntil: FieldValue.delete(),
      ...(!failures.length ? { status: 'complete', completedAt: FieldValue.serverTimestamp() } : {}),
      ...(unresolvedObjects.length ? { unresolved: FieldValue.arrayUnion(...unresolvedObjects) } : {}),
    });
  });
  if (failures.length) throw new AggregateError(failures, 'Pin image cleanup failed for event ' + eventId);
}

export async function reconcilePinImages(db: Firestore, getBucket: () => Bucket): Promise<void> {
  await sweepPinImages(db, getBucket, false);
  await sweepPinImages(db, getBucket, true);
}

async function sweepPinImages(db: Firestore, getBucket: () => Bucket, orphan: boolean): Promise<void> {
  const cursor = db.collection('pinImageCleanupState').doc(orphan ? 'upload-intents' : 'claims');
  const position = await cursor.get();
  const after = position.get('after');
  const ordered = db.collection(orphan ? 'pinImageUploadIntents' : 'pinImageClaims')
    .orderBy(FieldPath.documentId()).limit(CLAIMS_PER_SWEEP);
  const page = await (after ? ordered.startAfter(after) : ordered).get();
  await Promise.all(page.docs.map(async source => {
    try {
      const { pinId, userId, createdAt } = source.data();
      if (!uuidPattern.test(source.id) || !validPinIdentity(pinId, userId)) return;
      if (orphan && (!(createdAt instanceof Timestamp) ||
          createdAt.toMillis() + UPLOAD_INTENT_MS > source.readTime.toMillis())) return;
      const job = db.collection('pinImageCleanupJobs').doc(source.id);
      const pin = db.collection('pins').doc(pinId);
      const pending = await db.runTransaction(async transaction => {
        const [current, existing] = await transaction.getAll(pin, job);
        if (current.get('imageIncarnation') === source.id) return false;
        if (orphan && (await transaction.get(db.collection('pinImageClaims').doc(source.id))).exists) return false;
        if (existing.exists) return existing.get('status') === 'pending';
        transaction.create(job, {
          pinId, userId, eventId: 'reconciliation', claimCreatedAt: source.createTime, status: 'pending',
          ...(orphan ? { source: 'upload-intent' } : {}),
        });
        return true;
      });
      if (pending) await resumePinImageCleanup(db, getBucket, source.id);
    } catch (error) {
      console.error('Pin image reconciliation failed', { incarnation: source.id, error });
    }
  }));
  await db.runTransaction(async transaction => {
    const current = await transaction.get(cursor);
    if (position.exists ? !current.updateTime?.isEqual(position.updateTime!) : current.exists) return;
    transaction.set(cursor, { after: page.size === CLAIMS_PER_SWEEP ? page.docs.at(-1)!.id : null });
  });
}
