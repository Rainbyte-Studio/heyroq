import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { isPublicPin } from './engagement';
import { IMAGE_PROTOCOL, matchesImageSignature, pinImagePath } from './pinImageUpload';
import { pinImageDeliveryUrl } from './pinImageDeliveryUrl';

const segment = /^[A-Za-z0-9_:@.-]{1,180}$/;
const objectName = /^[A-Za-z0-9_.-]{1,240}$/;
const generationPattern = /^[1-9][0-9]{0,19}$/;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
const maxImageBytes = 10 * 1024 * 1024;

export function referencedPinImage(value: unknown, bucket: string, uid: string, pinId: string): string | undefined {
  if (typeof value !== 'string' || value.length > 2500) return;
  try {
    const url = new URL(value);
    const prefix = '/v0/b/' + bucket + '/o/';
    if (url.origin !== 'https://firebasestorage.googleapis.com' || url.username || url.password ||
        !url.pathname.startsWith(prefix)) return;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const components = path.split('/');
    const [root, owner, associatedPin] = components;
    if (owner !== uid || components.some(part => !objectName.test(part) || part === '.' || part === '..')) return;
    if (root === 'pins' && components.length === 3) return path;
    if (['pin-images', 'pin-images-v2'].includes(root) && components.length === 5 && associatedPin === pinId) return path;
  } catch {
    return;
  }
  return undefined;
}

const unavailable = () => new HttpsError('not-found', 'This image is unavailable.');
type ImageKey = { pin: string; incarnation: string; image: string };
const id = /^[a-z0-9]{20}$/i;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function validImageKey(key: Partial<ImageKey>): key is ImageKey {
  return typeof key.pin === 'string' && id.test(key.pin) && typeof key.incarnation === 'string' &&
    uuid.test(key.incarnation) && typeof key.image === 'string' && uuid.test(key.image);
}

async function managedBytes(db: Firestore, bucket: Bucket, key: ImageKey, pin: DocumentSnapshot) {
  const uid = pin.get('userId');
  const url = pinImageDeliveryUrl(key.pin, key.incarnation, key.image);
  if (!pin.exists || typeof uid !== 'string' || !segment.test(uid) || uid === '.' || uid === '..' ||
      pin.get('imageIncarnation') !== key.incarnation || !Array.isArray(pin.get('imageUrls')) ||
      !pin.get('imageUrls').includes(url)) throw unavailable();
  const claimRef = db.doc('pinImageClaims/' + key.incarnation);
  const claim = await claimRef.get();
  const matches = claim.get('images');
  const entry = Array.isArray(matches) ? matches.find(row => row.uploadId === key.image) : undefined;
  if (claim.get('protocol') !== IMAGE_PROTOCOL || claim.get('delivery') !== 'checked-v1' ||
      claim.get('userId') !== uid || claim.get('pinId') !== key.pin ||
      !claim.createTime?.isEqual(pin.createTime!) || !entry || !generationPattern.test(entry.generation)) throw unavailable();
  const path = pinImagePath(uid, key.pin, key.incarnation, key.image);
  const [metadata] = await bucket.file(path).getMetadata();
  const tags = metadata.metadata ?? {};
  const size = Number(metadata.size);
  const type = metadata.contentType ?? '';
  if (String(metadata.generation) !== entry.generation || tags.protocol !== IMAGE_PROTOCOL || tags.delivery !== 'checked-v1' ||
      tags.uploadedBy !== uid || tags.pinId !== key.pin || tags.incarnation !== key.incarnation || tags.uploadId !== key.image ||
      tags.firebaseStorageDownloadTokens || metadata.contentEncoding || !imageTypes.has(type) ||
      !Number.isSafeInteger(size) || size < 1 || size > maxImageBytes) throw unavailable();
  const [bytes] = await bucket.file(path, { generation: entry.generation }).download({ decompress: false });
  if (bytes.length !== size || !matchesImageSignature(bytes, type)) throw unavailable();
  return { bytes, type, claimRef, claimVersion: claim.updateTime! };
}

export async function readPublicPinImage(db: Firestore, bucket: Bucket, key: Partial<ImageKey>) {
  if (!validImageKey(key)) throw unavailable();
  try {
    const ref = db.doc('pins/' + key.pin);
    const pin = await ref.get();
    if (!isPublicPin(pin)) throw unavailable();
    const uid = pin.get('userId');
    if (typeof uid !== 'string' || !segment.test(uid) || uid === '.' || uid === '..') throw unavailable();
    const lock = db.doc('accountDeletionLocks/' + uid);
    const profile = db.doc('users/' + uid);
    const output = await managedBytes(db, bucket, key, pin);
    const [current, owner, deletion, claim] = await db.getAll(ref, profile, lock, output.claimRef);
    if (!isPublicPin(current) || !current.updateTime?.isEqual(pin.updateTime!) || !owner.exists ||
        owner.get('deletionStatus') === 'deleting' || deletion.exists ||
        !claim.updateTime?.isEqual(output.claimVersion)) throw unavailable();
    return { bytes: output.bytes, type: output.type };
  } catch { throw unavailable(); }
}

function permitted(pin: DocumentSnapshot, profile: DocumentSnapshot, lock: DocumentSnapshot, uid: string) {
  return pin.exists && pin.get('userId') === uid && !pin.get('isDeleted') &&
    !['removed', 'reported'].includes(pin.get('status')) && !pin.get('isReported') && !isPublicPin(pin) &&
    profile.exists && profile.get('deletionStatus') !== 'deleting' && !lock.exists;
}

export async function readRestrictedPinImage(
  db: Firestore, bucket: Bucket, uid: string | undefined, input: unknown,
) {
  if (!uid || !segment.test(uid) || uid === '.' || uid === '..') throw new HttpsError('unauthenticated', 'Sign in to see this image.');
  const data = input as { pinId?: unknown; index?: unknown } | null;
  if (!data || Array.isArray(data) || Object.keys(data).length !== 2 ||
      typeof data.pinId !== 'string' || !segment.test(data.pinId) || ['.', '..'].includes(data.pinId) ||
      typeof data.index !== 'number' || !Number.isInteger(data.index) || data.index < 0 || data.index >= 20) {
    throw new HttpsError('invalid-argument', 'Choose a pin and an image.');
  }
  const pinId = data.pinId;
  const index = data.index;
  const refs = [db.doc('pins/' + pinId), db.doc('users/' + uid), db.doc('accountDeletionLocks/' + uid)] as const;
  const [pin, profile, lock] = await db.getAll(...refs);
  if (!permitted(pin, profile, lock, uid)) throw unavailable();
  const urls = pin.get('imageUrls');
  const value = Array.isArray(urls) ? urls[index] : undefined;
  if (typeof value === 'string' && value.includes('/publicPinImageV1?')) {
    try {
      const query = new URL(value).searchParams;
      const key = { pin: pinId, incarnation: query.get('incarnation') ?? '', image: query.get('image') ?? '' };
      if (!validImageKey(key) || value !== pinImageDeliveryUrl(key.pin, key.incarnation, key.image)) throw unavailable();
      const { bytes, type, claimRef, claimVersion } = await managedBytes(db, bucket, key, pin);
      const [current, owner, deletion, claim] = await db.getAll(...refs, claimRef);
      if (!permitted(current, owner, deletion, uid) || !current.updateTime?.isEqual(pin.updateTime!) ||
          !claim.updateTime?.isEqual(claimVersion)) throw unavailable();
      return { mimeType: type, content: bytes.toString('base64') };
    } catch { throw unavailable(); }
  }
  const path = referencedPinImage(value, bucket.name, uid, pinId);
  if (!path) throw unavailable();
  try {
    const [metadata] = await bucket.file(path).getMetadata();
    const tags = metadata.metadata ?? {};
    const generation = String(metadata.generation);
    const size = Number(metadata.size);
    const type = metadata.contentType ?? '';
    if (!generationPattern.test(generation) || tags.heyroqRestricted !== '1' ||
        tags.heyroqRestrictedOwner !== uid || tags.heyroqRestrictedPin !== pinId ||
        tags.firebaseStorageDownloadTokens || !imageTypes.has(type) ||
        !Number.isSafeInteger(size) || size < 1 || size > maxImageBytes || metadata.contentEncoding) throw unavailable();
    const [bytes] = await bucket.file(path, { generation }).download({ decompress: false });
    if (bytes.length !== size || !matchesImageSignature(bytes, type)) throw unavailable();
    const [current, currentProfile, currentLock] = await db.getAll(...refs);
    const [currentMetadata] = await bucket.file(path).getMetadata();
    if (!permitted(current, currentProfile, currentLock, uid) || !current.updateTime?.isEqual(pin.updateTime!) ||
        currentMetadata.generation !== metadata.generation || currentMetadata.metageneration !== metadata.metageneration) throw unavailable();
    return { mimeType: type, content: bytes.toString('base64') };
  } catch {
    // The callable intentionally has one error for missing or unapproved objects.
    throw unavailable();
  }
}
