import { httpsCallable } from 'firebase/functions';
import { uploadBatch } from './uploadBatch';
import {
  ref,
  deleteObject,
} from 'firebase/storage';
import { auth, functions, storage } from '../lib/firebase';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/avif',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

/**
 * Validates file type and size according to security guidelines.
 */
export function validateImageFile(file: File): void {
  if (!file) {
    throw new Error('No image file was provided.');
  }

  // Validate MIME type
  const mime = file.type?.toLowerCase();
  const isAllowedType = ALLOWED_MIME_TYPES.includes(mime) || file.name.match(/\.(jpg|jpeg|png|webp|gif|heic|avif)$/i);
  if (!isAllowedType) {
    throw new Error(
      `Unsupported file type "${file.type || 'unknown'}". Please upload a JPEG, PNG, WebP, GIF, HEIC, or AVIF image.`
    );
  }

  // Validate File Size
  if (file.size <= 0) {
    throw new Error('The selected image file appears to be empty.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File "${file.name}" is too large (${sizeInMb}MB). The maximum allowed image size is 10MB.`
    );
  }
}

/**
 * Checks whether a URL points to a Firebase Storage object owned by `userId` inside `profile-images/{userId}/`.
 * Pure helper exported for deterministic security testing.
 */
export function isOwnedProfileStorageUrl(url: string | undefined | null, userId: string): boolean {
  if (!url || !userId) return false;
  const lower = url.toLowerCase();

  if (
    lower.includes('dicebear.com') ||
    lower.includes('googleusercontent.com') ||
    lower.includes('ggpht.com') ||
    lower.includes('unsplash.com')
  ) {
    return false;
  }

  const isFirebaseStorage =
    lower.includes('firebasestorage.googleapis.com') ||
    lower.includes('.firebasestorage.app') ||
    lower.includes('storage.googleapis.com');

  if (!isFirebaseStorage) return false;

  const expectedPrefix = `profile-images/${userId}/`;
  const encodedPrefix = encodeURIComponent(expectedPrefix);
  return url.includes(expectedPrefix) || url.includes(encodedPrefix);
}

export const MAX_PIN_IMAGES = 20;

interface PinImageClaim {
  protocol: 'server-v1';
  userId: string;
  pinId: string;
  images: { uploadId: string; generation: string }[];
  imageUrls: string[];
}

const pinImageUpload = httpsCallable(functions, 'pinImageUpload', { timeout: 65_000 });

function pinImageType(file: File): string {
  if (ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) return file.type.toLowerCase();
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
}

function encodePinImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected image.'));
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

export async function uploadMultipleImages(files: File[], pinId: string, requestedIncarnation: string) {
  if (files.length > MAX_PIN_IMAGES) throw new Error('You can upload up to ' + MAX_PIN_IMAGES + ' photos.');
  files.forEach(validateImageFile);
  const uid = auth.currentUser?.uid;
  const begin = await pinImageUpload({
    action: 'begin', pinId, incarnation: requestedIncarnation, images: files.map(file => ({ size: file.size, type: pinImageType(file) })),
  });
  // The previous callable chooses its own incarnation. Use the returned key
  // for the entire session, including the eventual Firestore claim.
  const { incarnation, uploadIds } = (begin.data ?? {}) as { incarnation?: string; uploadIds?: string[] };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (typeof incarnation !== 'string' || !uuid.test(incarnation) ||
      !Array.isArray(uploadIds) || uploadIds.length !== files.length ||
      uploadIds.some(id => typeof id !== 'string' || !uuid.test(id)) ||
      new Set(uploadIds).size !== uploadIds.length) {
    throw new Error('The server did not return a valid image upload authorization.');
  }
  // Limit simultaneous encodes and requests, especially on mobile.
  for (let index = 0; index < files.length; index += 2) {
    const pair = files.slice(index, index + 2).map((file, offset) => ({ file, uploadId: uploadIds[index + offset] }));
    await uploadBatch(pair, async ({ file, uploadId }) => pinImageUpload({
      action: 'upload', incarnation, uploadId, content: await encodePinImage(file),
    }));
  }
  const { data } = await pinImageUpload({ action: 'finish', incarnation });
  const claim = data as PinImageClaim;
  if (claim?.protocol !== 'server-v1' || claim.pinId !== pinId || claim.userId !== uid ||
      !Array.isArray(claim.images) || !Array.isArray(claim.imageUrls) ||
      claim.images.length !== uploadIds.length || claim.imageUrls.length !== uploadIds.length ||
      claim.images.some((image, index) => image?.uploadId !== uploadIds[index])) {
    throw new Error('The server did not confirm the authorized images.');
  }
  return { incarnation, claim };
}

const uploadProfileAvatar = httpsCallable<
  { userId: string; content: string; contentType: string },
  { downloadUrl: string }
>(functions, 'uploadProfileAvatar', { timeout: 65_000 });

/** Uploads an avatar through the server. Progress marks encode, send and confirmation. */
export async function uploadProfileImageWithProgress(
  file: File,
  userId: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error('Sign in to upload your own profile photo.');
  }
  validateImageFile(file);
  onProgress?.(5);
  const content = await encodePinImage(file);
  if (auth.currentUser?.uid !== userId) throw new Error('The signed-in account changed.');
  onProgress?.(15);
  const { data } = await uploadProfileAvatar({ userId, content, contentType: pinImageType(file) });
  if (auth.currentUser?.uid !== userId) throw new Error('The signed-in account changed.');
  if (typeof data?.downloadUrl !== 'string' || !data.downloadUrl) {
    throw new Error('The server did not confirm the avatar upload.');
  }
  onProgress?.(100);
  return data.downloadUrl;
}

/**
 * Uploads a user avatar image to Firebase Storage at profile-images/{userId}/{fileName}.
 * Enforces ownership matching authenticated userId and 10MB image limit.
 */
export async function uploadProfileImage(file: File, userId: string): Promise<string> {
  return uploadProfileImageWithProgress(file, userId);
}

/**
 * Safely deletes a previously uploaded avatar from Firebase Storage when replaced or removed.
 * Verifies that the URL belongs strictly to profile-images/{userId}/.
 * Never deletes default avatars, external photos, Google photos, or DiceBear SVGs.
 */
export async function deletePreviousProfileImage(oldUrl: string | undefined, userId: string): Promise<boolean> {
  if (!oldUrl || !userId) return false;
  if (auth.currentUser && auth.currentUser.uid !== userId) {
    return false;
  }

  if (!isOwnedProfileStorageUrl(oldUrl, userId)) {
    return false;
  }

  try {
    const fileRef = ref(storage, oldUrl);
    await deleteObject(fileRef);
    return true;
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') {
      return true;
    }
    console.warn(`Could not delete previous avatar: ${err?.message || err}`);
    return false;
  }
}
