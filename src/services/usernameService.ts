import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export const USERNAME_HINT = '3–24 letters (a–z), numbers or underscores.';

export function validateUsername(value: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error('Use ' + USERNAME_HINT);
  }
  return username;
}

const registry = doc(db, 'usernameRegistryState', 'v1');
const reservationRef = (username: string) => doc(db, 'usernames', username);
const profileRef = (uid: string) => doc(db, 'users', uid);

function registryReady(snapshot: DocumentSnapshot): void {
  if (snapshot.get('ready') !== true) {
    throw new Error('Username selection is temporarily unavailable. Please try again later.');
  }
}

function usernameTaken(): never {
  throw new Error('That username is already taken. Choose another.');
}

async function checkReservation(
  snapshot: DocumentSnapshot,
  username: string,
  uid: string | undefined,
  readProfile: (owner: string) => Promise<DocumentSnapshot>,
): Promise<void> {
  if (!snapshot.exists()) return;
  if (snapshot.get('blocked') === true) usernameTaken();
  const owner = snapshot.get('uid');
  if (typeof owner !== 'string' || !owner) usernameTaken();
  if (owner === uid) return;
  const ownerProfile = await readProfile(owner);
  if (ownerProfile.exists() && ownerProfile.get('username') === (snapshot.get('legacyUsername') ?? username)) {
    usernameTaken();
  }
}

export async function checkUsernameAvailable(value: string): Promise<string> {
  const username = validateUsername(value);
  registryReady(await getDocFromServer(registry));
  const reservation = await getDocFromServer(reservationRef(username));
  await checkReservation(reservation, username, auth.currentUser?.uid, uid => getDocFromServer(profileRef(uid)));
  return username;
}

/** The reservation and profile change commit together, including when two users choose the same handle. */
export async function saveProfileWithUsername(
  uid: string,
  value: string,
  changes: DocumentData,
  creating = false,
): Promise<void> {
  const username = validateUsername(value);
  const user = profileRef(uid);
  const claim = reservationRef(username);
  await runTransaction(db, async tx => {
    const current = await tx.get(user);
    if (creating && current.exists()) return;
    if (!creating && !current.exists()) throw new Error('Your profile could not be found.');
    registryReady(await tx.get(registry));
    const reservation = await tx.get(claim);
    await checkReservation(reservation, username, uid, owner => tx.get(profileRef(owner)));

    const previous = current.get('username');
    const previousKey = typeof previous === 'string' ? previous.trim().replace(/^@/, '').toLowerCase() : '';
    const previousClaim = previousKey !== username && /^[a-z0-9_]{3,24}$/.test(previousKey)
      ? await tx.get(reservationRef(previousKey))
      : null;

    if (auth.currentUser?.uid !== uid) throw new Error('Your signed-in account changed.');
    if (!reservation.exists() || reservation.get('uid') !== uid ||
        (reservation.get('legacyUsername') ?? username) !== username) {
      tx.set(claim, { uid });
    }
    const profileChanges = { ...changes, username, usernameLower: username };
    if (creating) tx.set(user, profileChanges);
    else tx.update(user, profileChanges);
    if (previousClaim?.get('uid') === uid) tx.delete(previousClaim.ref);
  });
}
