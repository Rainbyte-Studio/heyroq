import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { preferenceDefaults, type PreferenceKey } from '../utils/engagement';

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
export type EngagementPage = { items: EngagementRow[]; next: string | number | null; limited?: boolean };
type QueryAction = 'inbox' | 'mine' | 'following';

export async function loadEngagement(action: QueryAction, before?: string | number) {
  const request = httpsCallable<{ action: QueryAction; before?: string | number }, EngagementPage>(functions, 'engagementV1');
  return (await request({ action, ...(before === undefined ? {} : { before }) })).data;
}

export async function changeNotification(action: 'read' | 'delete' | 'readAll', id?: string) {
  await httpsCallable(functions, 'engagementV1')({ action, ...(id ? { id } : {}) });
}

export function subscribeToNotificationState(
  uid: string,
  next: (state: { unread: number; revision: number; offline: boolean }) => void,
  error: () => void,
) {
  return onSnapshot(doc(db, 'users', uid, 'notificationState', 'inbox'), { includeMetadataChanges: true }, snap => {
    const data = snap.data();
    next({ unread: Number(data?.unread) || 0, revision: Number(data?.revision) || 0, offline: snap.metadata.fromCache });
  }, error);
}

const settingsDoc = (uid: string) => doc(db, 'users', uid, 'notificationPreferences', 'settings');

export function subscribeToEngagementSettings(
  uid: string,
  next: (settings: Record<PreferenceKey, boolean>, offline: boolean) => void,
  error: () => void,
) {
  return onSnapshot(settingsDoc(uid), { includeMetadataChanges: true }, snap => {
    const settings = { ...preferenceDefaults };
    for (const key of Object.keys(settings) as PreferenceKey[]) {
      const value = snap.get(key);
      if (typeof value === 'boolean') settings[key] = value;
    }
    next(settings, snap.metadata.fromCache);
  }, error);
}

export function saveEngagementSetting(uid: string, key: PreferenceKey, value: boolean) {
  return setDoc(settingsDoc(uid), { [key]: value }, { merge: true });
}
