import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  initializeFirestore,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  doc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Pin, UserProfile, UserAchievement } from '../src/types';
import { calculateProgression } from '../src/services/gamificationService';

async function main() {
  console.log('================================================================');
  console.log('HEYROQ EXPLORER PROGRESSION: PRODUCTION MIGRATION EXECUTION');
  console.log('================================================================\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInWithEmailAndPassword(
    auth,
    'cloudfunction_test_user@example.com',
    'Password123!'
  );

  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );

  const usersSnap = await getDocs(collection(db, 'users'));
  const pinsSnap = await getDocs(collection(db, 'pins'));
  const allPins: Pin[] = pinsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Pin, 'id'>),
  }));

  console.log(`Found ${usersSnap.docs.length} users and ${allPins.length} pins in database.`);

  const migrationResults: any[] = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    if (userId.startsWith('explorertest_') || userId.startsWith('system_')) {
      console.log(`Skipping internal/test user: ${userId}`);
      continue;
    }

    const profileData = userDoc.data() as UserProfile;
    const userPins = allPins.filter((p) => p.userId === userId && !p.isDeleted);

    console.log(`\nProcessing user: ${userId} (${profileData.displayName || profileData.username})`);

    // 1. Fetch current progression summary (BEFORE state)
    const summaryRef = doc(db, 'users', userId, 'progression', 'summary');
    const existingSummaryDoc = await getDoc(summaryRef);
    const beforeSummary = existingSummaryDoc.exists() ? existingSummaryDoc.data() : null;

    // 2. Fetch existing achievements to preserve unlock timestamps & permanent status
    const existingAchievements: UserAchievement[] = [];
    const existingAchSnap = await getDocs(collection(db, 'users', userId, 'achievements'));
    existingAchSnap.forEach((d) => existingAchievements.push(d.data() as UserAchievement));

    // 3. Recalculate with authoritative rebalanced engine
    const calculated = calculateProgression(
      userId,
      userPins,
      profileData,
      existingAchievements
    );

    console.log(`  BEFORE -> XP: ${beforeSummary?.xp ?? 0}, Level: ${beforeSummary?.level ?? 1} (${beforeSummary?.title ?? 'New Explorer'}), Next: ${beforeSummary?.nextLevelXp ?? 300}`);
    console.log(`  AFTER  -> XP: ${calculated.summary.xp}, Level: ${calculated.summary.level} (${calculated.summary.title}), Next: ${calculated.summary.nextLevelXp}`);

    // 4. Batch write xpEvents
    // First, list existing xpEvents
    const existingXpEventsSnap = await getDocs(collection(db, 'users', userId, 'xpEvents'));
    const existingXpDocIds = new Set(existingXpEventsSnap.docs.map((d) => d.id));
    const newXpDocIds = new Set(calculated.xpEvents.map((e) => e.id));

    // Delete obsolete events that are not in the recalculated set
    for (const oldDoc of existingXpEventsSnap.docs) {
      if (!newXpDocIds.has(oldDoc.id)) {
        console.log(`  Removing stale xpEvent: ${oldDoc.id}`);
        await deleteDoc(doc(db, 'users', userId, 'xpEvents', oldDoc.id));
      }
    }

    // Write authoritative xpEvents
    for (const event of calculated.xpEvents) {
      const eventRef = doc(db, 'users', userId, 'xpEvents', event.id);
      await setDoc(eventRef, event, { merge: true });
    }
    console.log(`  Updated ${calculated.xpEvents.length} authoritative xpEvents.`);

    // 5. Batch write achievements
    for (const ach of calculated.achievements) {
      const achRef = doc(db, 'users', userId, 'achievements', ach.id);
      await setDoc(achRef, ach, { merge: true });
    }
    console.log(`  Updated ${calculated.achievements.length} achievements.`);

    // 6. Write authoritative summary
    await setDoc(summaryRef, calculated.summary, { merge: true });
    console.log(`  Updated progression summary document at users/${userId}/progression/summary.`);

    // 7. Verify read back
    const verifyDoc = await getDoc(summaryRef);
    const verifiedData = verifyDoc.data();
    if (!verifiedData) {
      throw new Error(`Verification failed: document at users/${userId}/progression/summary is empty`);
    }

    const xpRemaining = verifiedData.nextLevelXp === Infinity ? 0 : Math.max(0, verifiedData.nextLevelXp - verifiedData.xp);

    migrationResults.push({
      userId,
      displayName: profileData.displayName || profileData.username || 'Anonymous',
      documentPath: `users/${userId}/progression/summary`,
      before: {
        xp: beforeSummary?.xp ?? 0,
        level: beforeSummary?.level ?? 1,
        title: beforeSummary?.title ?? 'New Explorer',
        nextLevelXp: beforeSummary?.nextLevelXp ?? 300,
        progressPercent: beforeSummary?.progressPercent ?? 0,
      },
      after: {
        xp: verifiedData.xp,
        level: verifiedData.level,
        title: verifiedData.title,
        currentLevelBaseXp: verifiedData.currentLevelBaseXp,
        nextLevelXp: verifiedData.nextLevelXp,
        xpRemaining,
        progressPercent: verifiedData.progressPercent,
        unlockedAchievementsCount: verifiedData.unlockedAchievementsCount,
        spots: verifiedData.totalSpotsCount,
        cities: verifiedData.citiesCount,
        countries: verifiedData.countriesCount,
      },
    });
  }

  console.log('\n================================================================');
  console.log('PRODUCTION MIGRATION EXECUTION COMPLETE');
  console.log('================================================================\n');

  console.log(JSON.stringify(migrationResults, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
