import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const DATABASE_ID = config.firestoreDatabaseId || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

async function main() {
  const app = initializeApp(config);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true }, DATABASE_ID);

  const pinId = 'QCi5GdjStN5o2uXyBWlT';
  const pinRef = doc(db, 'pins', pinId);
  const pinSnap = await getDoc(pinRef);

  if (!pinSnap.exists()) {
    console.log(`Pin ${pinId} does not exist!`);
    return;
  }

  const data = pinSnap.data();
  console.log('--- PIN DETAILS ---');
  console.log('ID:', pinId);
  console.log('Title:', data.title);
  console.log('Owner userId:', data.userId);
  console.log('Stored likeCount:', data.likeCount);
  console.log('Stored commentCount:', data.commentCount);
  console.log('Created At:', data.createdAt);

  console.log('\n--- LIKES SUBCOLLECTION ---');
  const likesSnap = await getDocs(collection(db, 'pins', pinId, 'likes'));
  console.log('Canonical Likes Count:', likesSnap.size);
  likesSnap.docs.forEach((d) => {
    console.log('Like Doc ID (UID):', d.id, 'Data:', d.data());
  });

  console.log('\n--- COMMENTS SUBCOLLECTION ---');
  const commentsSnap = await getDocs(collection(db, 'pins', pinId, 'comments'));
  console.log('Canonical Comments Count:', commentsSnap.size);
  commentsSnap.docs.forEach((d) => {
    const cData = d.data();
    console.log('Comment Doc ID:', d.id, '| Author UID:', cData.userId, '| Author Name:', cData.userName, '| Text:', cData.text);
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
