import { httpsCallable } from 'firebase/functions';
import { uploadBatch } from './uploadBatch';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
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

/**
 * Wraps a promise with a timeout to prevent operations from hanging indefinitely
 * if the underlying network connection or retry loop becomes unresponsive.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    }),
  ]);
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

export async function uploadMultipleImages(files: File[], pinId: string) {
  if (files.length > MAX_PIN_IMAGES) throw new Error('You can upload up to ' + MAX_PIN_IMAGES + ' photos.');
  files.forEach(validateImageFile);
  const begin = await pinImageUpload({
    action: 'begin', pinId, images: files.map(file => ({ size: file.size, type: pinImageType(file) })),
  });
  const { incarnation, uploadIds } = begin.data as { incarnation: string; uploadIds: string[] };
  // Limit simultaneous encodes and requests, especially on mobile.
  for (let index = 0; index < files.length; index += 2) {
    const pair = files.slice(index, index + 2).map((file, offset) => ({ file, uploadId: uploadIds[index + offset] }));
    await uploadBatch(pair, async ({ file, uploadId }) => pinImageUpload({
      action: 'upload', incarnation, uploadId, content: await encodePinImage(file),
    }));
  }
  const { data } = await pinImageUpload({ action: 'finish', incarnation });
  return { incarnation, claim: data as PinImageClaim };
}

/**
 * Uploads a user avatar image to Firebase Storage at profile-images/{userId}/{fileName}
 * with optional real-time progress reporting.
 * Enforces ownership matching authenticated userId and 10MB image limit.
 */
export async function uploadProfileImageWithProgress(
  file: File,
  userId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!userId) {
    throw new Error('Authentication required to upload profile avatar.');
  }
  if (auth.currentUser && auth.currentUser.uid !== userId) {
    throw new Error('You can only upload a profile photo for your own account.');
  }

  validateImageFile(file);

  try {
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storageRef = ref(storage, `profile-images/${userId}/${timestamp}_${cleanFileName}`);
    const metadata = {
      contentType: file.type || 'image/jpeg',
      customMetadata: {
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      },
    };

    onProgress?.(5);

    const uploadPromise = new Promise<typeof storageRef>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      task.on(
        'state_changed',
        (snap) => {
          if (snap.totalBytes > 0) {
            const pct = Math.min(95, Math.max(5, Math.round((snap.bytesTransferred / snap.totalBytes) * 95)));
            onProgress?.(pct);
          }
        },
        (err) => reject(err),
        () => resolve(task.snapshot.ref)
      );
    });

    const uploadedRef = await withTimeout(
      uploadPromise,
      20000,
      'Avatar upload timed out after 20 seconds. Please check your connection and try again.'
    );

    const downloadUrl = await withTimeout(
      getDownloadURL(uploadedRef),
      10000,
      'Failed to retrieve avatar download URL.'
    );
    onProgress?.(100);
    return downloadUrl;
  } catch (error: any) {
    console.error('Firebase Storage profile avatar upload failed:', error);
    let message = 'Failed to upload avatar image.';
    if (error?.code === 'storage/unauthorized') {
      message = 'Storage permission denied. Please verify your authentication status.';
    } else if (error?.code === 'storage/canceled') {
      message = 'Avatar upload was canceled.';
    } else if (error?.code === 'storage/quota-exceeded') {
      message = 'Storage quota exceeded. Please try again later.';
    } else if (error?.message) {
      message = error.message.startsWith('Storage error:')
        ? error.message
        : `Storage error: ${error.message}`;
    }
    throw new Error(message);
  }
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
