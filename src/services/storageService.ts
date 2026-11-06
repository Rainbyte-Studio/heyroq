import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';

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
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File "${file.name}" is too large (${sizeInMb}MB). The maximum allowed image size is 10MB.`
    );
  }
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

/**
 * Uploads a validated pin image directly to Firebase Storage and returns the public download URL.
 * Does NOT fallback to Base64 or local storage.
 */
export async function uploadPinImage(file: File, userId: string): Promise<string> {
  if (!userId) {
    throw new Error('Authentication required to upload photos.');
  }

  // Enforce strict client-side validation first
  validateImageFile(file);

  try {
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storageRef = ref(storage, `pins/${userId}/${timestamp}_${cleanFileName}`);

    const snapshot = await withTimeout(
      uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
        customMetadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      }),
      15000,
      'Photo upload timed out after 15 seconds. Storage bucket may not exist or be reachable.'
    );

    const downloadUrl = await withTimeout(
      getDownloadURL(snapshot.ref),
      10000,
      'Failed to retrieve photo download URL.'
    );
    return downloadUrl;
  } catch (error: any) {
    console.error('Firebase Storage upload failed:', error);
    let message = 'Failed to upload photo to Firebase Storage.';
    if (error?.code === 'storage/unauthorized') {
      message = 'Storage permission denied. Please verify your authentication status.';
    } else if (error?.code === 'storage/canceled') {
      message = 'Upload was canceled.';
    } else if (error?.code === 'storage/quota-exceeded') {
      message = 'Storage quota exceeded. Please try again later.';
    } else if (error?.code === 'storage/retry-limit-exceeded' || error?.message?.includes('timed out')) {
      message = 'Upload timed out. The storage server or bucket was unreachable.';
    } else if (error?.status === 404 || error?.code === 'storage/unknown' || error?.message?.includes('404')) {
      message = 'Firebase Storage bucket not found or not initialized in the Firebase project.';
    } else if (error?.message) {
      message = `Storage error: ${error.message}`;
    }
    throw new Error(message);
  }
}

export async function uploadMultipleImages(files: File[], userId: string): Promise<string[]> {
  // Validate all files prior to beginning uploads
  for (const file of files) {
    validateImageFile(file);
  }

  const uploadPromises = files.map((file) => uploadPinImage(file, userId));
  return Promise.all(uploadPromises);
}

/**
 * Uploads a user avatar image to Firebase Storage at profile-images/{userId}/{fileName}.
 * Enforces ownership matching authenticated userId and 10MB image limit.
 */
export async function uploadProfileImage(file: File, userId: string): Promise<string> {
  if (!userId) {
    throw new Error('Authentication required to upload profile avatar.');
  }

  validateImageFile(file);

  try {
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storageRef = ref(storage, `profile-images/${userId}/${timestamp}_${cleanFileName}`);

    const snapshot = await withTimeout(
      uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
        customMetadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      }),
      15000,
      'Avatar upload timed out after 15 seconds. Storage bucket may not exist or be reachable.'
    );

    const downloadUrl = await withTimeout(
      getDownloadURL(snapshot.ref),
      10000,
      'Failed to retrieve avatar download URL.'
    );
    return downloadUrl;
  } catch (error: any) {
    console.error('Firebase Storage profile avatar upload failed:', error);
    let message = 'Failed to upload avatar image.';
    if (error?.code === 'storage/unauthorized') {
      message = 'Storage permission denied. Please verify your authentication status.';
    } else if (error?.message) {
      message = `Storage error: ${error.message}`;
    }
    throw new Error(message);
  }
}

/**
 * Safely deletes a previously uploaded avatar from Firebase Storage when replaced.
 * Verifies that the URL belongs to profile-images/{userId}/.
 * Never deletes default avatars, external photos, or DiceBear SVGs.
 */
export async function deletePreviousProfileImage(oldUrl: string | undefined, userId: string): Promise<boolean> {
  if (!oldUrl || !userId) return false;

  // Skip external URLs, DiceBear SVGs, Google user avatars, or non-Firebase Storage URLs
  if (
    oldUrl.includes('dicebear.com') ||
    oldUrl.includes('googleusercontent.com') ||
    oldUrl.includes('unsplash.com') ||
    !oldUrl.includes('firebasestorage.googleapis.com')
  ) {
    return false;
  }

  // Ensure the file belongs strictly to this user's profile images folder
  const expectedPrefix = `profile-images/${userId}/`;
  const encodedPrefix = encodeURIComponent(expectedPrefix);
  if (!oldUrl.includes(expectedPrefix) && !oldUrl.includes(encodedPrefix)) {
    console.warn('Skipping deletion: Old avatar URL does not belong to user profile-images folder.');
    return false;
  }

  try {
    const fileRef = ref(storage, oldUrl);
    await deleteObject(fileRef);
    console.log(`Cleaned up old avatar for user ${userId}`);
    return true;
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') {
      return true;
    }
    console.warn(`Could not delete previous avatar: ${err?.message || err}`);
    return false;
  }
}

/**
 * Safely deletes an array of pin images belonging to a user from Firebase Storage.
 */
export async function deletePinImages(imageUrls: string[], userId: string): Promise<void> {
  if (!imageUrls || !imageUrls.length || !userId) return;

  const expectedPrefix = `pins/${userId}/`;
  const encodedPrefix = encodeURIComponent(expectedPrefix);

  for (const url of imageUrls) {
    if (
      !url ||
      !url.includes('firebasestorage.googleapis.com') ||
      (!url.includes(expectedPrefix) && !url.includes(encodedPrefix))
    ) {
      continue;
    }

    try {
      const fileRef = ref(storage, url);
      await deleteObject(fileRef);
      console.log(`Deleted pin image file from storage: ${url}`);
    } catch (err: any) {
      if (err?.code !== 'storage/object-not-found') {
        console.warn(`Notice deleting pin image from storage: ${err?.message || err}`);
      }
    }
  }
}


