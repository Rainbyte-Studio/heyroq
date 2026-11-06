import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const PROJECT_ID = config.projectId || 'rainbyte-studio';
const DATABASE_ID = config.firestoreDatabaseId || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

const app = getApps().length === 0 ? initializeApp({ projectId: PROJECT_ID }) : getApps()[0];
const db = getFirestore(app, DATABASE_ID);
const auth = getAuth(app);

async function comprehensiveAudit() {
  console.log('--- COMPREHENSIVE AURORA PIN & USER AUDIT ---');
  const pinId = 'QCi5GdjStN5o2uXyBWlT';
  const pinRef = db.collection('pins').doc(pinId);
  const pinDoc = await pinRef.get();

  if (!pinDoc.exists) {
    console.log(`Pin ${pinId} DOES NOT EXIST`);
    return;
  }

  const pinData = pinDoc.data()!;
  console.log('Pin Title:', pinData.title);
  console.log('Pin Author:', pinData.userId, `(${pinData.userName})`);
  console.log('Pin likeCount in Firestore doc:', pinData.likeCount);
  console.log('Pin commentCount in Firestore doc:', pinData.commentCount);
  console.log('Pin raw data:', JSON.stringify(pinData, null, 2));

  // Check subcollections under pins/QCi5GdjStN5o2uXyBWlT
  const subcollections = await pinRef.listCollections();
  console.log('\nSubcollections under pin:');
  for (const sub of subcollections) {
    const snap = await sub.get();
    console.log(`- Subcollection '${sub.id}' (size: ${snap.size})`);
    snap.docs.forEach(doc => {
      console.log(`   * Doc ID: ${doc.id}, data:`, doc.data());
    });
  }

  // Check all users in Firebase Auth
  console.log('\n--- ALL USERS IN FIREBASE AUTH ---');
  const authUsers = await auth.listUsers();
  console.log(`Total Auth Users: ${authUsers.users.length}`);
  authUsers.users.forEach(u => {
    console.log(`- Auth UID: ${u.uid} | Email: ${u.email} | DisplayName: ${u.displayName} | Created: ${u.metadata.creationTime}`);
  });

  // Check all users in Firestore 'users' collection
  console.log('\n--- ALL USERS IN FIRESTORE USERS COLLECTION ---');
  const firestoreUsers = await db.collection('users').get();
  console.log(`Total Firestore User docs: ${firestoreUsers.size}`);
  firestoreUsers.forEach(u => {
    const data = u.data();
    console.log(`- Doc ID: ${u.id} | Email: ${data.email} | DisplayName: ${data.displayName} | Username: ${data.username} | Role: ${data.role}`);
  });

  // Check if there are any other pins in the DB
  const allPins = await db.collection('pins').get();
  console.log(`\nTotal Pins in DB: ${allPins.size}`);
  for (const p of allPins.docs) {
    const d = p.data();
    const likesSnap = await p.ref.collection('likes').get();
    const commentsSnap = await p.ref.collection('comments').get();
    console.log(`Pin ${p.id}: "${d.title}" | stored likeCount=${d.likeCount} (likes doc count=${likesSnap.size}) | stored commentCount=${d.commentCount} (comments doc count=${commentsSnap.size})`);
  }
}

comprehensiveAudit().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
