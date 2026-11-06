import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  initializeFirestore,
  getDoc,
  getDocs,
  collection,
  doc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function main() {
  console.log('=== VERIFYING LIVE FIRESTORE PROGRESSION DATA ===\n');

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

  const userId = '1XUiIYnfOWTG7uFU736I25CskZU2';

  // 1. Verify summary document
  const summaryDoc = await getDoc(doc(db, 'users', userId, 'progression', 'summary'));
  if (!summaryDoc.exists()) {
    throw new Error('Summary document does not exist!');
  }
  const summary = summaryDoc.data();
  console.log('Document path: users/' + userId + '/progression/summary');
  console.log('Live Summary Data:');
  console.log('  XP:', summary.xp);
  console.log('  Level:', summary.level);
  console.log('  Title:', summary.title);
  console.log('  Current Level Base XP:', summary.currentLevelBaseXp);
  console.log('  Next Level XP:', summary.nextLevelXp);
  console.log('  Progress Percent:', summary.progressPercent + '%');
  console.log('  XP Remaining to Level 2:', summary.nextLevelXp - summary.xp);
  console.log('  Unlocked Achievements:', summary.unlockedAchievementsCount);

  // 2. Verify achievements subcollection
  const achSnap = await getDocs(collection(db, 'users', userId, 'achievements'));
  console.log(`\nAchievements subcollection count: ${achSnap.docs.length}`);
  const unlocked = achSnap.docs
    .map((d) => d.data())
    .filter((a) => a.isUnlocked);
  console.log(`Unlocked achievements (${unlocked.length}):`);
  unlocked.forEach((a) => {
    console.log(`  - [${a.tier}] ${a.title}: +${a.xpReward} XP (unlockedAt: ${a.unlockedAt})`);
  });

  // 3. Verify xpEvents subcollection
  const eventsSnap = await getDocs(collection(db, 'users', userId, 'xpEvents'));
  console.log(`\nXP Events subcollection count: ${eventsSnap.docs.length}`);
  let totalLedgerXp = 0;
  eventsSnap.docs.forEach((d) => {
    const ev = d.data();
    totalLedgerXp += Number(ev.xpEarned) || 0;
    console.log(`  - ${ev.id}: +${ev.xpEarned} XP (${ev.action})`);
  });
  console.log(`Total Ledger XP: ${totalLedgerXp} XP`);

  if (summary.xp !== totalLedgerXp) {
    throw new Error(`Summary XP (${summary.xp}) does not match Ledger XP (${totalLedgerXp})`);
  }

  console.log('\n✅ VERIFICATION SUCCESSFUL: Live Firestore matches rebalanced architecture 100%!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
