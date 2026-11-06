import { initializeApp } from 'firebase/app';
import { initializeFirestore, getDocs, collection } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function listUsers() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);

  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnap.size} user documents in 'users' collection:`);
  usersSnap.forEach(d => {
    const data = d.data();
    console.log(`- UID: ${d.id} | email: ${data.email} | displayName: ${data.displayName}`);
  });
}

listUsers().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
