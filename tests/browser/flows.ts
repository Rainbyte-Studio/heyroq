import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { getBytes, ref } from 'firebase/storage';
import { auth, db, storage } from '../../src/lib/firebase';
import { executeDeleteUserAccount } from '../../src/services/accountSecurityService';
import { createPin, deletePin, newPinPublishAttempt } from '../../src/services/pinService';
import { uploadProfileImage } from '../../src/services/storageService';

Object.assign(window, {
  heyroqTest: {
    async signUp(email: string, password: string) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      return user.uid;
    },
    async publish(uid: string, bytes: number[]) {
      const attempt = newPinPublishAttempt();
      const draft = {
        userId: uid, userName: '', userAvatar: '', title: 'Browser smoke test', description: '',
        latitude: 37, longitude: 23, category: 'Other' as const, tags: [],
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
      await updateDoc(doc(db, 'users', uid), { photoURL: url });
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
