import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function checkTestUser() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, 'cloudfunction_test_user@example.com', 'Password123!');
  console.log('Signed in UID:', cred.user.uid, 'email:', cred.user.email);
  const token = await cred.user.getIdTokenResult();
  console.log('Claims:', token.claims);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  // Check if this user is in users/
  const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
  console.log('User doc exists?', userDoc.exists(), userDoc.data());

  // Check what happens if we attempt to update likeCount on Aurora pin
  const pinRef = doc(db, 'pins', 'QCi5GdjStN5o2uXyBWlT');
  try {
    await updateDoc(pinRef, { likeCount: 0 });
    console.log('SUCCESS: updateDoc likeCount: 0 succeeded!');
  } catch (err: any) {
    console.log('FAILED updateDoc likeCount: 0:', err.code, err.message);
  }
}

checkTestUser().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
