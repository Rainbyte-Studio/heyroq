import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { getBytes, ref } from 'firebase/storage';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AchievementsModal } from '../../src/components/Profile/AchievementsModal';
import { auth, db, storage } from '../../src/lib/firebase';
import '../../src/index.css';
import App from '../../src/App';
import { AuthProvider } from '../../src/context/AuthContext';
import { CreatePinModal } from '../../src/components/Pin/CreatePinModal';
import { executeDeleteUserAccount } from '../../src/services/accountSecurityService';
import { createPin, deletePin, fetchPinById, newPinPublishAttempt, subscribeToViewportPins } from '../../src/services/pinService';
import { computeGeohash } from '../../src/utils/geo';
import { uploadProfileImage } from '../../src/services/storageService';

Object.assign(window, {
  heyroqTest: {
    signOut: () => signOut(auth),
    async currentUserId() {
      await auth.authStateReady();
      return auth.currentUser?.uid;
    },
    async readablePin(id: string) {
      return Boolean(await fetchPinById(id));
    },
    watchPinViewport(onResult: (ids: string[]) => void) {
      return subscribeToViewportPins({ north: 37.1, south: 36.9, west: 22.9, east: 23.1 },
        pins => onResult(pins.map(pin => pin.id)));
    },
    fixtureGeohash: () => computeGeohash(37, 23),
    signIn: (email: string, password: string) => signInWithEmailAndPassword(auth, email, password).then(() => undefined),
    mountCreatePin() {
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      root.render(createElement(AuthProvider, {
        children: createElement(CreatePinModal, {
          onClose: () => { root.unmount(); host.remove(); },
          selectedLocation: null,
          onActivateMapPick: () => {},
          onPinCreated: () => {},
        }),
      }));
    },
    mountSearchApp() {
      window.history.replaceState(null, '', '/');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      createRoot(host).render(createElement(App));
    },
    mountAchievementsTrigger(uid: string, nested = false) {
      const host = document.createElement('div');
      const trigger = document.createElement('button');
      trigger.textContent = nested ? 'Open Profile Achievements' : 'Open Explorer Progression';
      const parent = nested ? document.createElement('dialog') : null;
      const fallback = document.createElement('button');
      fallback.textContent = 'Close fixture profile';
      if (parent) {
        parent.setAttribute('aria-label', 'Fixture profile');
        parent.append(fallback, trigger, host);
        document.body.append(parent);
        parent.showModal();
        fallback.addEventListener('click', () => parent.close());
      } else {
        document.body.append(trigger, host);
      }
      const root = createRoot(host);
      trigger.dataset.backgroundEscaped = 'false';
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') trigger.dataset.backgroundEscaped = 'true';
      });
      trigger.addEventListener('click', () => {
        root.render(createElement(AchievementsModal, {
          userId: uid,
          displayName: 'Browser fixture',
          onClose: () => root.render(null),
          fallbackFocusRef: { current: fallback },
        }));
      });
    },
    async tryWriteVerifiedProgress(uid: string) {
      try {
        await updateDoc(doc(db, 'progressionV11', uid, 'achievements', 'city_pathfinder'), { verifiedGeographicProgress: 10 });
        return 'unexpected success';
      } catch (error) {
        return (error as { code: string }).code;
      }
    },
    async signUp(email: string, password: string) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      return user.uid;
    },
    async publish(uid: string, bytes: number[]) {
      const attempt = newPinPublishAttempt();
      const draft = {
        userId: uid, userName: '', userAvatar: '', title: 'Browser smoke test', description: '',
        latitude: 37.98376, longitude: 23.72784, category: 'Other' as const, tags: [],
        geographySelection: { countryCode: 'GR', cityId: '264371' },
      };
      const files = [new File([new Uint8Array(bytes)], 'pin.png', { type: 'image/png' })];
      const pinId = await createPin(draft, files, attempt);
      const retry = await createPin(draft, files, attempt);
      const snap = await getDocFromServer(doc(db, 'pins', pinId));
      return { pinId, retry, urls: snap.get('imageUrls') as string[] };
    },
    async legacy(path: string) {
      return Array.from(new Uint8Array(await getBytes(ref(storage, path))));
    },
    async avatar(uid: string, bytes: number[]) {
      const file = new File([new Uint8Array(bytes)], 'avatar.png', { type: 'image/png' });
      const url = await uploadProfileImage(file, uid);
      await updateDoc(doc(db, 'users', uid), { photoURL: url, avatarUrl: url });
      return url;
    },
    async removePin(pinId: string, uid: string) {
      await deletePin(pinId, uid);
      await deletePin(pinId, uid);
      return (await getDocFromServer(doc(db, 'pins', pinId))).exists();
    },
    async deleteAccount() {
      const user = auth.currentUser;
      if (!user) throw new Error('Missing emulator user.');
      const first = await executeDeleteUserAccount(user, 'DELETE');
      const retry = await executeDeleteUserAccount(user, 'DELETE');
      return [first.status, retry.status];
    },
  },
});
