import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function inspectAuroraPin() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  const pinRef = doc(db, 'pins', 'QCi5GdjStN5o2uXyBWlT');
  const pinSnap = await getDoc(pinRef);
  if (!pinSnap.exists()) {
    console.log('Pin QCi5GdjStN5o2uXyBWlT does not exist!');
    return;
  }

  console.log('--- PIN DATA ---');
  console.log(JSON.stringify(pinSnap.data(), null, 2));

  console.log('\n--- LIKES SUBCOLLECTION ---');
  const likesSnap = await getDocs(collection(db, 'pins', 'QCi5GdjStN5o2uXyBWlT', 'likes'));
  console.log(`Total like documents: ${likesSnap.size}`);
  likesSnap.forEach(d => {
    console.log(`Like doc ID: ${d.id}, data:`, d.data());
  });

  console.log('\n--- COMMENTS SUBCOLLECTION ---');
  const commentsSnap = await getDocs(collection(db, 'pins', 'QCi5GdjStN5o2uXyBWlT', 'comments'));
  console.log(`Total comment documents: ${commentsSnap.size}`);
  commentsSnap.forEach(d => {
    console.log(`Comment doc ID: ${d.id}, data:`, d.data());
  });
}

inspectAuroraPin().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
