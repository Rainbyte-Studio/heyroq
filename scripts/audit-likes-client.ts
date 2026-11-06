import { initializeApp } from 'firebase/app';
import { initializeFirestore, getDocs, collection } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function checkPinsAndLikes() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  console.log('Querying pins collection...');
  const pinsSnap = await getDocs(collection(db, 'pins'));
  console.log(`Found ${pinsSnap.size} pins.`);

  for (const pinDoc of pinsSnap.docs) {
    const pin = pinDoc.data();
    const likesSnap = await getDocs(collection(db, 'pins', pinDoc.id, 'likes'));
    console.log(`Pin ID: ${pinDoc.id} | Title: "${pin.title}" | stored likeCount: ${pin.likeCount} | actual likes doc count: ${likesSnap.size}`);
    if (likesSnap.size > 0) {
      likesSnap.docs.forEach(d => console.log(`   - liked by user: ${d.id}`));
    }
  }
}

checkPinsAndLikes().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
