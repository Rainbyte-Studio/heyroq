import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function testFunctionTrigger() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  let userCred;
  const testEmail = 'cloudfunction_test_user@example.com';
  const testPass = 'Password123!';

  try {
    userCred = await signInWithEmailAndPassword(auth, testEmail, testPass);
    console.log('Signed in existing test user:', userCred.user.uid);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        userCred = await createUserWithEmailAndPassword(auth, testEmail, testPass);
        console.log('Created new test user:', userCred.user.uid);
      } catch (cErr) {
        console.error('Failed to create test user:', cErr);
        return;
      }
    } else {
      console.error('Failed to sign in:', err);
      return;
    }
  }

  const userId = userCred.user.uid;
  const pinId = 'QCi5GdjStN5o2uXyBWlT';
  const pinRef = doc(db, 'pins', pinId);
  const beforePin = await getDoc(pinRef);
  console.log('Before test like: likeCount =', beforePin.data()?.likeCount, 'updatedAt =', beforePin.data()?.updatedAt);

  const likeRef = doc(db, 'pins', pinId, 'likes', userId);
  console.log('Writing like document for test user...');
  await setDoc(likeRef, {
    userId,
    createdAt: new Date().toISOString(),
  });
  console.log('Like document written.');

  // Wait 4 seconds to see if Cloud Function fires
  console.log('Waiting 4 seconds for Cloud Function trigger...');
  await new Promise(r => setTimeout(r, 4000));

  const afterPin = await getDoc(pinRef);
  console.log('After test like: likeCount =', afterPin.data()?.likeCount, 'updatedAt =', afterPin.data()?.updatedAt);

  // Clean up: delete test like doc
  console.log('Cleaning up test like document...');
  await deleteDoc(likeRef);
  console.log('Like document deleted.');

  // Wait 4 seconds to see if Cloud Function decrements
  console.log('Waiting 4 seconds for Cloud Function delete trigger...');
  await new Promise(r => setTimeout(r, 4000));

  const finalPin = await getDoc(pinRef);
  console.log('Final pin: likeCount =', finalPin.data()?.likeCount, 'updatedAt =', finalPin.data()?.updatedAt);
}

testFunctionTrigger().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
