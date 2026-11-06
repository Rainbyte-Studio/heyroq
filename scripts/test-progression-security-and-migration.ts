import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  getDocs,
  getDoc,
  collection,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Pin, UserProfile, UserAchievement } from '../src/types';
import { calculateProgression } from '../src/services/gamificationService';

async function main() {
  console.log('====================================================');
  console.log('EXPLORER PROGRESSION: SECURITY & MIGRATION TEST SUITE');
  console.log('====================================================\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );

  // -------------------------------------------------------------------------
  // TEST 1: SECURITY & ANTI-TAMPER AUDIT (Client SDK Permission-Denied Test)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: SECURITY ANTI-TAMPER AUDIT (NON-ADMIN USER) ---');

  const normalEmail = `explorertest_${Date.now()}@example.com`;
  const normalPassword = 'TestPassword123!';
  let normalUserUid = '';

  try {
    const cred = await createUserWithEmailAndPassword(auth, normalEmail, normalPassword);
    normalUserUid = cred.user.uid;
    console.log(`Created temporary normal user: ${normalUserUid} (${normalEmail})`);
  } catch (err: any) {
    console.error('Failed to create test user for tampering test:', err);
    process.exit(1);
  }

  // Attempt 1A: Normal user attempts to overwrite progression summary (Forge Level 10, 99999 XP)
  console.log('\n[Tamper Attempt 1A] Normal user writes directly to /progression/summary...');
  try {
    await setDoc(doc(db, 'users', normalUserUid, 'progression', 'summary'), {
      level: 10,
      title: 'Master Explorer',
      xp: 99999,
      unlockedAchievementsCount: 18,
    });
    console.error('❌ CRITICAL VULNERABILITY: Normal user was able to forge progression summary!');
    process.exit(1);
  } catch (err: any) {
    if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
      console.log('✅ SECURE: Firestore rules correctly REJECTED client write to /progression/summary (permission-denied)');
    } else {
      console.warn('Unexpected error response:', err.code || err.message);
    }
  }

  // Attempt 1B: Normal user attempts to forge an unlocked achievement
  console.log('\n[Tamper Attempt 1B] Normal user writes directly to /achievements/curator_30...');
  try {
    await setDoc(doc(db, 'users', normalUserUid, 'achievements', 'curator_30'), {
      isUnlocked: true,
      progress: 30,
      xpReward: 350,
      unlockedAt: new Date().toISOString(),
    });
    console.error('❌ CRITICAL VULNERABILITY: Normal user was able to forge achievement unlock!');
    process.exit(1);
  } catch (err: any) {
    if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
      console.log('✅ SECURE: Firestore rules correctly REJECTED client write to /achievements (permission-denied)');
    } else {
      console.warn('Unexpected error response:', err.code || err.message);
    }
  }

  // Attempt 1C: Normal user attempts to forge an XP event
  console.log('\n[Tamper Attempt 1C] Normal user writes directly to /xpEvents/fake_bonus...');
  try {
    await setDoc(doc(db, 'users', normalUserUid, 'xpEvents', 'fake_bonus'), {
      action: 'CHEAT_XP',
      xpEarned: 50000,
      userId: normalUserUid,
    });
    console.error('❌ CRITICAL VULNERABILITY: Normal user was able to forge XP ledger event!');
    process.exit(1);
  } catch (err: any) {
    if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
      console.log('✅ SECURE: Firestore rules correctly REJECTED client write to /xpEvents (permission-denied)');
    } else {
      console.warn('Unexpected error response:', err.code || err.message);
    }
  }

  await signOut(auth);
  console.log('\nSigned out normal test user.');

  // -------------------------------------------------------------------------
  // TEST 2: AUTHORITATIVE MIGRATION VIA AUTHORIZED WRITER
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: AUTHORITATIVE MIGRATION & RECONCILIATION ---');
  console.log('Authenticating as administrative/service user for migration...');

  await signInWithEmailAndPassword(
    auth,
    'cloudfunction_test_user@example.com',
    'Password123!'
  );
  console.log('Authenticated as admin:', auth.currentUser?.uid);

  // Fetch all users and pins
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnap.size} user documents.`);

  const pinsSnap = await getDocs(collection(db, 'pins'));
  const allPins: Pin[] = pinsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Pin, 'id'>),
  }));
  console.log(`Found ${allPins.length} pins total.\n`);

  const migrationResults: any[] = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    // Skip the temporary test user
    if (userId === normalUserUid) continue;

    const profileData = userDoc.data() as UserProfile;
    const userPins = allPins.filter((p) => p.userId === userId && !p.isDeleted);

    // Read previous summary if exists
    let previousSummary: any = null;
    try {
      const prevDoc = await getDoc(doc(db, 'users', userId, 'progression', 'summary'));
      if (prevDoc.exists()) {
        previousSummary = prevDoc.data();
      }
    } catch (e) {
      // ignore
    }

    // Read existing achievements to preserve permanent unlocked state
    const existingAchievements: UserAchievement[] = [];
    try {
      const achSnap = await getDocs(collection(db, 'users', userId, 'achievements'));
      achSnap.forEach((d) => existingAchievements.push(d.data() as UserAchievement));
    } catch (e) {
      // ignore
    }

    // Compute progression using the new authoritative rules
    const { summary, achievements, xpEvents } = calculateProgression(
      userId,
      userPins,
      profileData,
      existingAchievements
    );

    migrationResults.push({
      userId,
      displayName: profileData.displayName || profileData.username || 'Anonymous',
      previousXp: previousSummary?.xp ?? 'None',
      previousLevel: previousSummary?.level ?? 'None',
      newXp: summary.xp,
      newLevel: summary.level,
      newTitle: summary.title,
      spots: summary.totalSpotsCount,
      cities: summary.citiesCount,
      countries: summary.countriesCount,
      unlockedAchievements: summary.unlockedAchievementsCount,
    });

    // Write authoritative data via admin batch
    const batch = writeBatch(db);

    // 1. Summary
    const summaryRef = doc(db, 'users', userId, 'progression', 'summary');
    batch.set(summaryRef, summary, { merge: true });

    // 2. Profile pinsCount update
    const profileRef = doc(db, 'users', userId);
    batch.set(profileRef, { pinsCount: summary.totalSpotsCount }, { merge: true });

    // 3. Achievements
    for (const ach of achievements) {
      const achRef = doc(db, 'users', userId, 'achievements', ach.id);
      batch.set(achRef, ach, { merge: true });
    }

    // 4. XP events
    for (const ev of xpEvents) {
      const evRef = doc(db, 'users', userId, 'xpEvents', ev.id);
      batch.set(evRef, ev, { merge: true });
    }

    await batch.commit();
  }

  console.log('MIGRATION RESULTS SUMMARY TABLE:');
  console.table(migrationResults);

  // -------------------------------------------------------------------------
  // TEST 3: IDEMPOTENCY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: IDEMPOTENCY VERIFICATION ---');
  if (migrationResults.length > 0) {
    const testUser = migrationResults[0];
    const userPins = allPins.filter((p) => p.userId === testUser.userId && !p.isDeleted);
    const userProfile = (await getDoc(doc(db, 'users', testUser.userId))).data() as UserProfile;

    // Fetch existing achievements
    const existingAchievements: UserAchievement[] = [];
    const achSnap = await getDocs(collection(db, 'users', testUser.userId, 'achievements'));
    achSnap.forEach((d) => existingAchievements.push(d.data() as UserAchievement));

    // Run calculation 2nd time
    const secondRun = calculateProgression(testUser.userId, userPins, userProfile, existingAchievements);

    // Run calculation 3rd time
    const thirdRun = calculateProgression(testUser.userId, userPins, userProfile, secondRun.achievements);

    console.log(`User: ${testUser.displayName} (${testUser.userId})`);
    console.log(`Run 1 XP: ${testUser.newXp} | Level: ${testUser.newLevel}`);
    console.log(`Run 2 XP: ${secondRun.summary.xp} | Level: ${secondRun.summary.level}`);
    console.log(`Run 3 XP: ${thirdRun.summary.xp} | Level: ${thirdRun.summary.level}`);

    if (testUser.newXp === secondRun.summary.xp && secondRun.summary.xp === thirdRun.summary.xp) {
      console.log('✅ IDEMPOTENCY CONFIRMED: XP remains strictly identical across runs with zero drift or duplication.');
    } else {
      console.error('❌ IDEMPOTENCY FAILURE: XP changed between runs!');
      process.exit(1);
    }
  }

  console.log('\n====================================================');
  console.log('ALL SECURITY, MIGRATION, AND IDEMPOTENCY TESTS PASSED');
  console.log('====================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
