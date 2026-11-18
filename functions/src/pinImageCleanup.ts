import { FieldValue, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generationPattern = /^[1-9][0-9]{0,19}$/;
const MAX_PIN_IMAGES = 20;

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

  if (typeof userId !== 'string' || !userId || userId.includes('/') ||
      !/^[A-Za-z0-9]{20}$/.test(pinId) ||
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

  await db.runTransaction(async transaction => {
    if ((await transaction.get(job)).exists) return;
    transaction.create(job, {
      pinId, userId, eventId, claimCreatedAt: claim.createTime, status: 'pending',
    });
  });
  await resumePinImageCleanup(db, getBucket, imageIncarnation);
}

// Re-run a specific recorded job. Its immutable claim remains the source of object identities.
export async function resumePinImageCleanup(
  db: Firestore, getBucket: () => Bucket, imageIncarnation: string,
): Promise<void> {
  if (!uuidPattern.test(imageIncarnation)) throw new Error('Invalid image incarnation');
  const job = db.collection('pinImageCleanupJobs').doc(imageIncarnation);
  const claim = db.collection('pinImageClaims').doc(imageIncarnation);
  const [jobSnapshot, claimSnapshot] = await db.getAll(job, claim);
  if (!jobSnapshot.exists) throw new Error('Pin image cleanup job not found');
  const { pinId, userId, eventId, claimCreatedAt, status } = jobSnapshot.data()!;
  if (status === 'complete') return;
  const data = claimSnapshot.data();
  if (!data || !claimSnapshot.createTime?.isEqual(claimCreatedAt) ||
      data.pinId !== pinId || data.userId !== userId || status !== 'pending' ||
      !Array.isArray(data.images) || !data.images.length || data.images.length > MAX_PIN_IMAGES) {
    throw new Error('Pin image cleanup claim no longer matches recorded job');
  }

  const unresolved = (reason: string, uploadId?: string) => {
    console.warn('Unresolved pin image cleanup', { eventId, pinId, reason, uploadId });
    return { reason, ...(uploadId ? { uploadId } : {}) };
  };
  const bucket = getBucket();
  const results = await Promise.allSettled(data.images.map(async image => {
    const { uploadId, generation } = image ?? {};
    if (typeof uploadId !== 'string' || !uuidPattern.test(uploadId) ||
        typeof generation !== 'string' || !generationPattern.test(generation)) {
      return unresolved('invalid-object-claim');
    }

    const path = 'pin-images/' + userId + '/' + pinId + '/' + imageIncarnation + '/' + uploadId;
    const file = bucket.file(path);
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
  if (unresolvedObjects.length || !failures.length) await job.update({
    ...(!failures.length ? { status: 'complete', completedAt: FieldValue.serverTimestamp() } : {}),
    ...(unresolvedObjects.length ? { unresolved: FieldValue.arrayUnion(...unresolvedObjects) } : {}),
  });
  if (failures.length) throw new AggregateError(failures, 'Pin image cleanup failed for event ' + eventId);
}
