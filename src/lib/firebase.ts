import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  getFirestore,
  persistentLocalCache,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const emulatorMode = import.meta.env.MODE === 'browser-emulator';
if (emulatorMode && window.location.hostname !== '127.0.0.1') {
  throw new Error('The emulator build requires 127.0.0.1.');
}
const app = emulatorMode ? initializeApp({
  apiKey: 'demo-heyroq',
  projectId: 'demo-heyroq',
  storageBucket: 'demo-heyroq.appspot.com',
}, 'heyroq-browser-emulator') : (!getApps().length ? initializeApp(firebaseConfig) : getApp());

// Initialize Services
export const auth = getAuth(app);
if (emulatorMode) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

// Initialize Cloud Firestore:
// We use experimentalAutoDetectLongPolling: true instead of experimentalForceLongPolling: true.
// Auto-detect tries standard streaming/WebSockets first and seamlessly falls back to long-polling
// only when needed, which prevents the transient 'Connection failed 1 times. [code=unavailable]' warning.
// In addition, persistentLocalCache ensures immediate offline resilience and fast subsequent loads.
let firestoreDb;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({}),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}
export const db = firestoreDb;
export const functions = getFunctions(app, 'europe-west2');
export const storage = getStorage(app);
if (emulatorMode) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
// Cap max retry time to prevent indefinite hanging (default is 10 minutes)
storage.maxUploadRetryTime = 10000;
storage.maxOperationRetryTime = 10000;

// Health check connection test utility as specified in SKILL.md
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('the client is offline') ||
        error.message.includes('offline') ||
        error.message.includes('unavailable'))
    ) {
      console.warn('Firebase client is offline or network connection is establishing.');
    }
  }
}
// Validate connection on boot asynchronously in browser runtime
if (typeof window !== 'undefined') {
  testConnection().catch(() => {});
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
