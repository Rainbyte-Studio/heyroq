import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Bucket, FileMetadata } from '@google-cloud/storage';

export const IMAGE_PROTOCOL = 'server-v1';
export const IMAGE_PREFIX = 'pin-images-v2';
export const UPLOAD_WINDOW_MS = 10 * 60_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 20;
const MAX_ENCODED_SIZE = Math.ceil(MAX_FILE_SIZE / 3) * 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATION = /^[1-9][0-9]{0,19}$/;
const PIN_ID = /^[A-Za-z0-9]{20}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);

interface ImageSpec {
  size: number;
  type: string;
}

interface UploadAuth {
  uid: string;
  token: { firebase: { sign_in_provider: string; tenant?: string } };
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function isImageSpec(value: unknown): value is ImageSpec {
  const spec = value as Partial<ImageSpec> | null;
  return !!spec && typeof spec.size === 'number' && Number.isInteger(spec.size) && spec.size > 0 && spec.size <= MAX_FILE_SIZE &&
    typeof spec.type === 'string' && MIME_TYPES.has(spec.type);
}

function matchesImageSignature(bytes: Buffer, type: string): boolean {
  const ascii = (from: number, to: number) => bytes.toString('latin1', from, to);
  switch (type) {
    case 'image/jpeg': return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/gif': return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    default: {
      if (bytes.length < 16 || ascii(4, 8) !== 'ftyp') return false;
      const end = bytes.readUInt32BE(0);
      if (end < 16 || end > Math.min(bytes.length, 1024) || end % 4 !== 0) return false;
      const accepted = type === 'image/avif' ? ['avif', 'avis'] : ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
      if (accepted.includes(ascii(8, 12))) return true;
      for (let index = 16; index < end; index += 4) {
        if (accepted.includes(ascii(index, index + 4))) return true;
      }
      return false;
    }
  }
}

export function pinImagePath(userId: string, pinId: string, incarnation: string, uploadId: string): string {
  return [IMAGE_PREFIX, userId, pinId, incarnation, uploadId].join('/');
}

async function assertActiveUser(db: Firestore, tx: Transaction, uid: string): Promise<void> {
  const [profile, lock] = await tx.getAll(db.collection('users').doc(uid), db.collection('accountDeletionLocks').doc(uid));
  if (!profile.exists || lock.exists || profile.get('deletionStatus') === 'deleting') {
    throw new HttpsError('permission-denied', 'An active profile is required.');
  }
}

export async function handlePinImageUpload(
  db: Firestore, getBucket: () => Bucket, auth: UploadAuth | undefined, input: unknown,
) {
  if (!auth || auth.token.firebase.sign_in_provider === 'anonymous' || auth.token.firebase.tenant) {
    throw new HttpsError('unauthenticated', 'Sign in to upload pin images.');
  }
  const uid = auth.uid;
  if (!uid || uid.includes('/') || uid === '.' || uid === '..') {
    throw new HttpsError('permission-denied', 'Invalid account.');
  }
  const data = input as { action?: unknown; pinId?: unknown; images?: unknown; incarnation?: unknown;
    uploadId?: unknown; content?: unknown } | null;
  if (data?.action === 'begin') {
    const { pinId, images } = data;
    if (typeof pinId !== 'string' || !PIN_ID.test(pinId) || !Array.isArray(images) ||
        images.length < 1 || images.length > MAX_IMAGES || !images.every(isImageSpec)) {
      return invalid('Supply a pin ID and valid image sizes and types.');
    }
    const incarnation = randomUUID();
    const uploadIds = images.map(() => randomUUID());
    const specs = images.map(({ size, type }) => ({ size, type }));
    const quota = db.collection('pinImageUploadQuotas').doc(uid);
    const globalQuota = db.collection('pinImageUploadQuotas').doc('global').collection('capacity').doc('hourly');
    await db.runTransaction(async tx => {
      await assertActiveUser(db, tx, uid);
      const [pin, userLimit, globalLimit] = await tx.getAll(db.collection('pins').doc(pinId), quota, globalQuota);
      if (pin.exists) throw new HttpsError('already-exists', 'This pin already exists.');
      const now = Date.now();
      const hour = Math.floor(now / 3_600_000);
      const userCount = (userLimit.get('hour') === hour ? userLimit.get('count') : 0) + specs.length;
      const globalCount = (globalLimit.get('hour') === hour ? globalLimit.get('count') : 0) + specs.length;
      if (userCount > 100 || globalCount > 200) {
        throw new HttpsError('resource-exhausted', 'Upload limit reached. Try again later.');
      }
      tx.set(quota, { hour, count: userCount });
      tx.set(globalQuota, { hour, count: globalCount });
      tx.create(db.collection('pinImageUploadIntents').doc(incarnation), {
        protocol: IMAGE_PROTOCOL, pinId, userId: uid, uploadIds, specs,
        createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + UPLOAD_WINDOW_MS),
        cleanupAfter: Timestamp.fromMillis(now + 60 * 60_000),
      });
    });
    return { incarnation, uploadIds };
  }

  if (!data || typeof data.incarnation !== 'string' || !UUID.test(data.incarnation)) {
    return invalid('Invalid upload authorization.');
  }
  const incarnation = data.incarnation;
  const intent = db.collection('pinImageUploadIntents').doc(incarnation);
  const approval = db.collection('pinImageApprovals').doc(incarnation);
  const job = db.collection('pinImageCleanupJobs').doc(incarnation);

  async function openIntent(tx: Transaction) {
    await assertActiveUser(db, tx, uid);
    const [snapshot, cleanup] = await tx.getAll(intent, job);
    const record = snapshot.data();
    if (record?.protocol !== IMAGE_PROTOCOL || record.userId !== uid) {
      throw new HttpsError('permission-denied', 'Upload authorization is unavailable.');
    }
    if (cleanup.exists || record.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('deadline-exceeded', 'Upload authorization expired.');
    }
    return { pinId: record.pinId as string, uploadIds: record.uploadIds as string[],
      specs: record.specs as ImageSpec[], expiresAt: record.expiresAt as Timestamp };
  }

  if (data.action === 'finish') {
    return db.runTransaction(async tx => {
      const { pinId, uploadIds, expiresAt } = await openIntent(tx);
      const existing = await tx.get(approval);
      if (existing.exists) return existing.get('claim');
      const receipts = await tx.getAll(...uploadIds.map(uploadId => intent.collection('receipts').doc(uploadId)));
      if (receipts.some(receipt => !GENERATION.test(receipt.get('generation') ?? '') || !receipt.get('downloadUrl'))) {
        throw new HttpsError('failed-precondition', 'The authorized images have not all been uploaded.');
      }
      const claim = {
        protocol: IMAGE_PROTOCOL, pinId, userId: uid,
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
  const nonce = randomUUID();
  const token = randomUUID();
  const { pinId, spec } = await db.runTransaction(async tx => {
    const authorization = await openIntent(tx);
    const spec = authorization.specs[authorization.uploadIds.indexOf(uploadId)];
    if (!spec || content.length !== Math.ceil(spec.size / 3) * 4) return invalid('Image does not match the authorization.');
    const existing = await tx.get(receipt);
    if (existing.exists) throw new HttpsError('already-exists', 'This upload slot was already used.');
    tx.create(receipt, { nonce });
    return { pinId: authorization.pinId, spec };
  });
  const bytes = Buffer.from(content, 'base64');
  if (bytes.length !== spec.size || bytes.toString('base64') !== content || !matchesImageSignature(bytes, spec.type)) {
    return invalid('Image bytes do not match the authorized format or size.');
  }

  const bucket = getBucket();
  const path = pinImagePath(uid, pinId, incarnation, uploadId);
  const file = bucket.file(path);
  let metadata: FileMetadata;
  try {
    await file.save(bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: spec.type,
        metadata: { protocol: IMAGE_PROTOCOL, uploadedBy: uid, pinId, incarnation, uploadId, nonce,
          firebaseStorageDownloadTokens: token },
      },
    });
    [metadata] = await file.getMetadata();
  } catch (error) {
    const code = (error as { code?: number } | null)?.code;
    console.warn('Pin image Storage request failed', { pinId, incarnation, uploadId, code });
    throw new HttpsError(code === 412 ? 'failed-precondition' : 'unavailable',
      'The image could not be stored and verified. Start a new publish attempt.');
  }
  const generation = String(metadata.generation);
  const custom = metadata.metadata;
  if (!GENERATION.test(generation) || Number(metadata.size) !== spec.size || metadata.contentType !== spec.type ||
      custom?.protocol !== IMAGE_PROTOCOL || custom.nonce !== nonce || custom.uploadedBy !== uid ||
      custom.pinId !== pinId || custom.incarnation !== incarnation || custom.uploadId !== uploadId ||
      custom.firebaseStorageDownloadTokens !== token) {
    throw new HttpsError('failed-precondition', 'Stored image does not match the authorization.');
  }
  const downloadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name +
    '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token;
  await receipt.update({ generation, downloadUrl });
  return { uploaded: true };
}
