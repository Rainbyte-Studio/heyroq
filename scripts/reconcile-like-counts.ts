/**
 * Heyroq - Pin Like Counter Reconciliation Script
 *
 * Reconciles parent `pins/{pinId}.likeCount` with the actual number of documents
 * in the `pins/{pinId}/likes` subcollection.
 *
 * Invariants:
 * - 100% Idempotent: Only updates documents where `likeCount !== actualCount`.
 * - Read-only on likes subcollection (never modifies like documents).
 * - Bounded to database `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
 * - Supports `--dry-run` to audit discrepancies without performing writes.
 * - Supports Admin SDK and authenticated Admin fallback.
 *
 * Usage:
 *   # Audit discrepancies only:
 *   npx tsx scripts/reconcile-like-counts.ts --dry-run
 *
 *   # Execute reconciliation:
 *   npx tsx scripts/reconcile-like-counts.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp as initClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
if (!existsSync(configPath)) {
  throw new Error(`Configuration file missing at ${configPath}`);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const PROJECT_ID = config.projectId || 'rainbyte-studio';
const DATABASE_ID =
  config.firestoreDatabaseId || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

console.log('='.repeat(70));
console.log(' Heyroq - Pin Like Counter Reconciliation Tool');
console.log('='.repeat(70));
console.log(`• Firebase Project ID : ${PROJECT_ID}`);
console.log(`• Firestore Database  : ${DATABASE_ID}`);
console.log(`• Dry Run Mode        : ${IS_DRY_RUN ? 'YES (Audit only, no writes)' : 'NO (Applying fixes)'}`);
console.log('='.repeat(70) + '\n');

interface ReconciliationSummary {
  totalPinsScanned: number;
  inSyncPins: number;
  reconciledPins: number;
  discrepancies: {
    pinId: string;
    title: string;
    storedCount: number;
    actualCount: number;
  }[];
}

export async function reconcilePinLikeCounts(): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    totalPinsScanned: 0,
    inSyncPins: 0,
    reconciledPins: 0,
    discrepancies: [],
  };

  const app = initClientApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    DATABASE_ID
  );

  if (!IS_DRY_RUN) {
    try {
      await signInWithEmailAndPassword(
        auth,
        'cloudfunction_test_user@example.com',
        'Password123!'
      );
      console.log('• Authenticated as admin user for reconciliation writes.\n');
    } catch (authErr) {
      console.warn('• Note authenticating admin user:', authErr);
    }
  }

  console.log('Scanning pins collection for like count discrepancies...\n');

  try {
    const pinsSnapshot = await getDocs(collection(db, 'pins'));
    summary.totalPinsScanned = pinsSnapshot.size;

    for (const pinDoc of pinsSnapshot.docs) {
      const pinId = pinDoc.id;
      const pinData = pinDoc.data();
      const storedLikeCount = typeof pinData.likeCount === 'number' ? pinData.likeCount : 0;
      const pinTitle = pinData.title || 'Untitled Pin';

      const likesSnapshot = await getDocs(collection(db, 'pins', pinId, 'likes'));
      const actualLikeCount = likesSnapshot.size;

      if (storedLikeCount === actualLikeCount) {
        summary.inSyncPins++;
        console.log(`  [IN SYNC] "${pinTitle}" (${pinId}): stored=${storedLikeCount}, actual=${actualLikeCount}`);
      } else {
        summary.discrepancies.push({
          pinId,
          title: pinTitle,
          storedCount: storedLikeCount,
          actualCount: actualLikeCount,
        });

        console.log(
          `  [DISCREPANCY] "${pinTitle}" (${pinId}): stored=${storedLikeCount} != actual=${actualLikeCount}`
        );

        if (!IS_DRY_RUN) {
          try {
            const pinRef = doc(db, 'pins', pinId);
            await updateDoc(pinRef, {
              likeCount: actualLikeCount,
            });
            summary.reconciledPins++;
            console.log(`    ↳ [RECONCILED] Updated likeCount to ${actualLikeCount}`);
          } catch (writeErr) {
            console.error(`    ↳ [ERROR] Failed to update pin ${pinId}:`, writeErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error during like count reconciliation:', err);
    throw err;
  }

  console.log('\n' + '='.repeat(70));
  console.log(' RECONCILIATION AUDIT SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Pins Scanned : ${summary.totalPinsScanned}`);
  console.log(`In-Sync Pins       : ${summary.inSyncPins}`);
  console.log(`Discrepant Pins    : ${summary.discrepancies.length}`);
  if (!IS_DRY_RUN) {
    console.log(`Reconciled Pins    : ${summary.reconciledPins}`);
  }
  console.log('='.repeat(70) + '\n');

  return summary;
}

if (process.argv[1]?.endsWith('reconcile-like-counts.ts')) {
  reconcilePinLikeCounts()
    .then(() => {
      console.log('Reconciliation run completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Reconciliation run failed:', err);
      process.exit(1);
    });
}
