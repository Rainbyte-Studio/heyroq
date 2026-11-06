import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function inspectPin() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, 'cloudfunction_test_user@example.com', 'Password123!');
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  const pinsSnap = await getDocs(collection(db, 'pins'));
  console.log(`Total pins found: ${pinsSnap.size}`);
  for (const docSnap of pinsSnap.docs) {
    const data = docSnap.data();
    if (data.title?.toLowerCase().includes('aurora') || docSnap.id === 'QCi5GdjStN5o2uXyBWlT') {
      console.log(`\nFound target pin: ID=${docSnap.id}, title=${data.title}`);
      console.log(`stored likeCount: ${data.likeCount}, commentCount: ${data.commentCount}`);
      const likesSnap = await getDocs(collection(db, 'pins', docSnap.id, 'likes'));
      console.log(`actual likes count: ${likesSnap.size}`);
      const commentsSnap = await getDocs(collection(db, 'pins', docSnap.id, 'comments'));
      console.log(`actual comments count: ${commentsSnap.size}`);
    }
  }
}

inspectPin().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
