/**
 * Heyroq Follower / Following Counter Reconciliation Script
 *
 * Uses the Firebase Admin SDK to audit and recalculate follow counters across all user profiles.
 *
 * For each user in `users/{uid}`:
 * 1. Counts documents in `users/{uid}/followers` subcollection.
 * 2. Counts documents in `users/{uid}/following` subcollection.
 * 3. Compares actual document count against `followersCount` and `followingCount`.
 * 4. Transactionally or atomically updates counters if discrepancy is detected.
 *
 * Safe to execute multiple times (100% idempotent).
 *
 * Usage:
 *   # Audit dry-run (no writes):
 *   npx tsx scripts/recalculate-follow-counts.ts --dry-run
 *
 *   # Standard reconciliation:
 *   npx tsx scripts/recalculate-follow-counts.ts
 *
 *   # With service account key:
 *   GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json npx tsx scripts/recalculate-follow-counts.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// 1. Load Firebase configuration
const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
if (!existsSync(configPath)) {
  throw new Error(`Config file not found at ${configPath}`);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const PROJECT_ID = config.projectId || 'rainbyte-studio';
const DATABASE_ID =
  config.firestoreDatabaseId || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

console.log('='.repeat(70));
console.log(' Heyroq - Follow Counters Reconciliation Tool (Admin SDK)');
console.log('='.repeat(70));
console.log(`• Firebase Project ID : ${PROJECT_ID}`);
console.log(`• Firestore Database  : ${DATABASE_ID}`);
console.log(`• Dry Run Mode        : ${IS_DRY_RUN ? 'YES (Audit only, no writes)' : 'NO (Applying fixes)'}`);
console.log('='.repeat(70) + '\n');

// 2. Initialize Firebase Admin App
let app: App;
if (getApps().length === 0) {
  const serviceAccountEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountEnv && existsSync(serviceAccountEnv)) {
    console.log(`• Using Service Account: ${serviceAccountEnv}`);
    const sa = JSON.parse(readFileSync(serviceAccountEnv, 'utf8'));
    app = initializeApp({
      credential: cert(sa),
      projectId: PROJECT_ID,
    });
  } else {
    console.log('• Using Application Default Credentials');
    app = initializeApp({
      projectId: PROJECT_ID,
    });
  }
} else {
  app = getApps()[0];
}

const db = getFirestore(app, DATABASE_ID);

interface ReconciliationSummary {
  totalUsersScanned: number;
  inSyncUsers: number;
  reconciledUsers: number;
  discrepancies: {
    userId: string;
    username: string;
    followersCountBefore: number;
    followersCountActual: number;
    followingCountBefore: number;
    followingCountActual: number;
  }[];
}

async function reconcileFollowCounters() {
  const summary: ReconciliationSummary = {
    totalUsersScanned: 0,
    inSyncUsers: 0,
    reconciledUsers: 0,
    discrepancies: [],
  };

  try {
    console.log('Scanning users collection...');
    const usersSnapshot = await db.collection('users').get();
    summary.totalUsersScanned = usersSnapshot.size;

    console.log(`Found ${summary.totalUsersScanned} user profile(s) in Firestore.\n`);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const username = userData.username || 'unknown';

      // Recorded counter values
      const storedFollowers = Number(userData.followersCount) || 0;
      const storedFollowing = Number(userData.followingCount) || 0;

      // Count actual documents in subcollections
      const followersColl = db.collection('users').doc(userId).collection('followers');
      const followingColl = db.collection('users').doc(userId).collection('following');

      const [followersCountSnap, followingCountSnap] = await Promise.all([
        followersColl.count().get(),
        followingColl.count().get(),
      ]);

      const actualFollowers = followersCountSnap.data().count;
      const actualFollowing = followingCountSnap.data().count;

      const followersMismatch = storedFollowers !== actualFollowers;
      const followingMismatch = storedFollowing !== actualFollowing;

      if (followersMismatch || followingMismatch) {
        summary.reconciledUsers++;
        summary.discrepancies.push({
          userId,
          username,
          followersCountBefore: storedFollowers,
          followersCountActual: actualFollowers,
          followingCountBefore: storedFollowing,
          followingCountActual: actualFollowing,
        });

        console.log(`[DISCREPANCY] User: ${userId} (@${username})`);
        console.log(`  - followersCount : stored=${storedFollowers} -> actual=${actualFollowers}`);
        console.log(`  - followingCount : stored=${storedFollowing} -> actual=${actualFollowing}`);

        if (!IS_DRY_RUN) {
          await userDoc.ref.update({
            followersCount: actualFollowers,
            followingCount: actualFollowing,
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`  ✓ Updated document users/${userId} to authoritative counts.\n`);
        } else {
          console.log(`  * [DRY RUN] Would update users/${userId} (skipped write).\n`);
        }
      } else {
        summary.inSyncUsers++;
        console.log(`[IN SYNC] User: ${userId} (@${username}) — followers=${storedFollowers}, following=${storedFollowing}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(' RECONCILIATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`• Total users audited   : ${summary.totalUsersScanned}`);
    console.log(`• In-sync profiles      : ${summary.inSyncUsers}`);
    console.log(`• Out-of-sync profiles  : ${summary.reconciledUsers}`);
    console.log(`• Actions taken         : ${IS_DRY_RUN ? 'Audit Only' : summary.reconciledUsers > 0 ? 'Repaired in Firestore' : 'None needed'}`);
    console.log('='.repeat(70));
  } catch (err: any) {
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
      console.warn('\n[Notice: Firebase Admin SDK requires active GCP Application Default Credentials or Service Account]');
      console.warn('When running on local machine or CI, supply GOOGLE_APPLICATION_CREDENTIALS="serviceAccount.json".');
    }
    console.error('Error during reconciliation:', err);
    process.exit(1);
  }
}

reconcileFollowCounters()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
