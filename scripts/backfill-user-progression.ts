import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  getDocs,
  collection,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Pin, UserProfile } from '../src/types';
import { calculateProgression } from '../src/services/gamificationService';

async function backfillUserProgression() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );

  console.log('Authenticating as admin user...');
  await signInWithEmailAndPassword(
    auth,
    'cloudfunction_test_user@example.com',
    'Password123!'
  );
  console.log('Authenticated as admin:', auth.currentUser?.uid);

  console.log('Fetching all users from Firestore...');
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnap.size} user documents.`);

  console.log('Fetching all pins from Firestore...');
  const pinsSnap = await getDocs(collection(db, 'pins'));
  const allPins: Pin[] = pinsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Pin, 'id'>),
  }));
  console.log(`Found ${allPins.length} pins in total.`);

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const profileData = userDoc.data() as UserProfile;
    const userPins = allPins.filter((p) => p.userId === userId);

    console.log(`\nProcessing user ${userId} (${profileData.displayName || 'Unknown'}):`);
    console.log(`- Author of ${userPins.length} pins`);

    const { summary, achievements, xpEvents } = calculateProgression(
      userId,
      userPins,
      profileData
    );

    console.log(
      `- Progression: Level ${summary.level} (${summary.title}) | ${summary.xp} XP | Next Level: ${summary.nextLevelXp} XP`
    );
    console.log(
      `- Footprint: ${summary.totalSpotsCount} spots across ${summary.citiesCount} cities & ${summary.countriesCount} countries`
    );
    console.log(
      `- Achievements: ${summary.unlockedAchievementsCount} / ${summary.totalAchievementsCount} unlocked`
    );

    const batch = writeBatch(db);

    // Write summary
    const summaryRef = doc(db, 'users', userId, 'progression', 'summary');
    batch.set(summaryRef, summary, { merge: true });

    // Write achievements
    for (const ach of achievements) {
      const achRef = doc(db, 'users', userId, 'achievements', ach.id);
      batch.set(achRef, ach, { merge: true });
    }

    await batch.commit();
    console.log(`- Successfully wrote progression summary and achievements for user ${userId}`);

    // Write XP events
    for (const ev of xpEvents.slice(-5)) {
      try {
        const evId = `${ev.action}_${ev.referenceId || Date.now()}`;
        await setDoc(doc(db, 'users', userId, 'xpEvents', evId), ev, { merge: true });
      } catch (e) {
        // ignore
      }
    }
  }

  console.log('\nBackfill completed successfully!');
}

backfillUserProgression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
