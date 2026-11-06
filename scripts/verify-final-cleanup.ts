import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import config from '../firebase-applet-config.json';

async function verifyFullSystem() {
  console.log('================================================================');
  console.log('       HEYROQ FINAL PRODUCTION CLEANUP POST-AUDIT CHECK         ');
  console.log('================================================================\n');

  const app = initializeApp(config);
  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    config.firestoreDatabaseId
  );

  // 1. Production Owner Check
  const ownerSnap = await getDoc(doc(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2'));
  console.log('1. Production Owner (1XUiIYnfOWTG7uFU736I25CskZU2):', {
    exists: ownerSnap.exists(),
    email: ownerSnap.data()?.email,
    displayName: ownerSnap.data()?.displayName,
    role: ownerSnap.data()?.role,
    followersCount: ownerSnap.data()?.followersCount,
    followingCount: ownerSnap.data()?.followingCount,
    pinsCount: ownerSnap.data()?.pinsCount,
  });

  // 2. Second Legitimate User Check
  const secondUserSnap = await getDoc(doc(db, 'users', 'RDsaxzejcYRty9ZMKvscvgCXLpt2'));
  console.log('2. Second Legitimate User (RDsaxzejcYRty9ZMKvscvgCXLpt2):', {
    exists: secondUserSnap.exists(),
    email: secondUserSnap.data()?.email,
    displayName: secondUserSnap.data()?.displayName,
    role: secondUserSnap.data()?.role,
    followersCount: secondUserSnap.data()?.followersCount,
    followingCount: secondUserSnap.data()?.followingCount,
  });

  // 3. System Curator Check
  const curatorSnap = await getDoc(doc(db, 'users', 'system_curator'));
  console.log('3. System Curator (system_curator):', {
    exists: curatorSnap.exists(),
    uid: curatorSnap.data()?.uid,
    displayNameLower: curatorSnap.data()?.displayNameLower,
  });

  // 4. Aurora Pin Check
  const pinSnap = await getDoc(doc(db, 'pins', 'QCi5GdjStN5o2uXyBWlT'));
  const pinData = pinSnap.data();
  console.log('4. Aurora Pin (QCi5GdjStN5o2uXyBWlT):', {
    exists: pinSnap.exists(),
    title: pinData?.title,
    locationName: pinData?.locationName,
    city: pinData?.city,
    country: pinData?.country,
    likeCount: pinData?.likeCount,
    commentCount: pinData?.commentCount,
    imageUrls: pinData?.imageUrls,
  });

  // 5. Aurora Likes Subcollection Check
  const likesSnap = await getDocs(collection(db, 'pins', 'QCi5GdjStN5o2uXyBWlT', 'likes'));
  console.log('5. Aurora Likes Count in Subcollection:', likesSnap.size);
  likesSnap.forEach((d) => console.log('   - Like by UID:', d.id, d.data()));

  // 6. Comments on Aurora Check
  const commentsSnap = await getDocs(collection(db, 'pins', 'QCi5GdjStN5o2uXyBWlT', 'comments'));
  console.log('6. Aurora Comments Count in Subcollection:', commentsSnap.size);
  commentsSnap.forEach((d) => console.log('   - Comment:', d.id, d.data()?.text, 'by', d.data()?.userId));

  // 7. Progression of Production Owner
  const progSummarySnap = await getDoc(
    doc(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2', 'progression', 'summary')
  );
  console.log('7. Progression Summary:', progSummarySnap.data());

  const achievementsSnap = await getDocs(
    collection(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2', 'achievements')
  );
  console.log('   Total Achievements:', achievementsSnap.size);

  const xpEventsSnap = await getDocs(
    collection(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2', 'xpEvents')
  );
  console.log('   Total XP Events:', xpEventsSnap.size);
  xpEventsSnap.forEach((d) => console.log('     * Event:', d.id, d.data()?.action, d.data()?.xpEarned, 'XP'));

  // 8. Follow Relationships Check
  const followersSnap = await getDocs(
    collection(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2', 'followers')
  );
  console.log('8. Owner Followers Doc Count:', followersSnap.size);

  const followingSnap = await getDocs(
    collection(db, 'users', 'RDsaxzejcYRty9ZMKvscvgCXLpt2', 'following')
  );
  console.log('   Drosoula Following Doc Count:', followingSnap.size);

  console.log('\n================================================================');
  console.log('                     AUDIT COMPLETE                             ');
  console.log('================================================================\n');
}

verifyFullSystem().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
