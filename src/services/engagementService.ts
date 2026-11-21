import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import {
  classifyEngagementError,
  preferenceDefaults,
  type EngagementErrorInfo,
  type PreferenceKey,
} from '../utils/engagement';

export type EngagementView = 'inbox' | 'history' | 'following' | 'mine' | 'settings';
export type EngagementRow = {
  id: string;
  at: number;
  type: string;
  read?: boolean;
  name?: string;
  avatar?: string;
  actorId?: string;
  pinId?: string;
  achievementId?: string;
  title?: string;
  xp?: number | null;
  level?: number | null;
  unavailable?: boolean;
};
export type EngagementPage = {
  items: EngagementRow[];
  next: string | number | null;
  limited?: boolean;
};
type QueryAction = 'inbox' | 'mine' | 'following';

export class EngagementServiceError extends Error {
  readonly info: EngagementErrorInfo;
  readonly code: string;

  constructor(info: EngagementErrorInfo, cause?: unknown) {
    super(info.message);
    this.name = 'EngagementServiceError';
    this.info = info;
    this.code = info.code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

function logEngagementDiagnostic(
  scope: 'callable' | 'settings' | 'state',
  operation: string,
  error: unknown,
  info: EngagementErrorInfo
) {
  const currentUser = auth.currentUser;
  console.error('[Heyroq Engagement]', {
    scope,
    operation,
    code: info.code,
    kind: info.kind,
    detail: info.detail,
    rawMessage: error instanceof Error ? error.message : String(error),
    auth: {
      signedIn: Boolean(currentUser),
      uid: currentUser?.uid ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
    },
  });
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function loadEngagement(action: QueryAction, before?: string | number) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    const info = classifyEngagementError({ code: 'functions/unauthenticated' }, 'callable');
    throw new EngagementServiceError(info);
  }
  try {
    const request = httpsCallable<
      { action: QueryAction; before?: string | number },
      EngagementPage
    >(functions, 'engagementV1');
    return (await request({ action, ...(before === undefined ? {} : { before }) })).data;
  } catch (error) {
    const info = classifyEngagementError(error, 'callable');
    logEngagementDiagnostic('callable', `engagementV1:${action}`, error, info);
    throw new EngagementServiceError(info, error);
  }
}

export async function changeNotification(
  action: 'read' | 'delete' | 'readAll',
  id?: string
) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    const info = classifyEngagementError({ code: 'functions/unauthenticated' }, 'callable');
    throw new EngagementServiceError(info);
  }
  try {
    await httpsCallable(functions, 'engagementV1')({ action, ...(id ? { id } : {}) });
  } catch (error) {
    const info = classifyEngagementError(error, 'callable');
    logEngagementDiagnostic('callable', `engagementV1:${action}`, error, info);
    throw new EngagementServiceError(info, error);
  }
}

export function subscribeToNotificationState(
  uid: string,
  next: (state: { unread: number; revision: number; offline: boolean }) => void,
  error: (info: EngagementErrorInfo) => void
) {
  const path = `users/${uid}/notificationState/inbox`;
  return onSnapshot(
    doc(db, 'users', uid, 'notificationState', 'inbox'),
    { includeMetadataChanges: true },
    (snap) => {
      const data = snap.data();
      next({
        unread: Number(data?.unread) || 0,
        revision: Number(data?.revision) || 0,
        offline: snap.metadata.fromCache && isBrowserOffline(),
      });
    },
    (err) => {
      const info = classifyEngagementError(err, 'state');
      logEngagementDiagnostic('state', `onSnapshot:${path}`, err, info);
      error(info);
    }
  );
}

const settingsDoc = (uid: string) =>
  doc(db, 'users', uid, 'notificationPreferences', 'settings');

export interface EngagementSettingsSnapshotMeta {
  offline: boolean;
  fromCache: boolean;
  exists: boolean;
}

export function subscribeToEngagementSettings(
  uid: string,
  next: (
    settings: Record<PreferenceKey, boolean>,
    meta: EngagementSettingsSnapshotMeta
  ) => void,
  error: (info: EngagementErrorInfo) => void
) {
  const path = `users/${uid}/notificationPreferences/settings`;
  return onSnapshot(
    settingsDoc(uid),
    { includeMetadataChanges: true },
    (snap) => {
      const settings = { ...preferenceDefaults };
      for (const key of Object.keys(settings) as PreferenceKey[]) {
        const value = snap.get(key);
        if (typeof value === 'boolean') settings[key] = value;
      }
      next(settings, {
        offline: snap.metadata.fromCache && isBrowserOffline(),
        fromCache: snap.metadata.fromCache,
        exists: snap.exists(),
      });
    },
    (err) => {
      const info = classifyEngagementError(err, 'settings');
      logEngagementDiagnostic('settings', `onSnapshot:${path}`, err, info);
      error(info);
    }
  );
}

export async function saveEngagementSetting(
  uid: string,
  key: PreferenceKey,
  value: boolean
) {
  const path = `users/${uid}/notificationPreferences/settings`;
  try {
    await setDoc(settingsDoc(uid), { [key]: value }, { merge: true });
  } catch (err) {
    const info = classifyEngagementError(err, 'settings');
    logEngagementDiagnostic('settings', `setDoc:${path}:${key}`, err, info);
    throw new EngagementServiceError(info, err);
  }
}
