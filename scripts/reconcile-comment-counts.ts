/**
 * Heyroq - Pin Comment Counter Reconciliation Script (Admin SDK)
 *
 * Reconciles parent `pins/{pinId}.commentCount` with the actual number of documents
 * in the `pins/{pinId}/comments` subcollection.
 *
 * Invariants:
 * - 100% Idempotent: Only updates documents where `commentCount !== actualCount`.
 * - Read-only on comments subcollection (never modifies comment documents).
 * - Bounded to database `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
 * - Supports `--dry-run` to audit discrepancies without performing writes.
 *
 * Usage:
 *   # Audit discrepancies only:
 *   npx tsx scripts/reconcile-comment-counts.ts --dry-run
 *
 *   # Execute reconciliation:
 *   npx tsx scripts/reconcile-comment-counts.ts
 *
 *   # With service account credentials:
 *   GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json npx tsx scripts/reconcile-comment-counts.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// 1. Configuration
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
console.log(' Heyroq - Pin Comment Counter Reconciliation Tool (Admin SDK)');
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

export async function reconcilePinCommentCounts(): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    totalPinsScanned: 0,
    inSyncPins: 0,
    reconciledPins: 0,
    discrepancies: [],
  };

  console.log('Scanning pins collection for comment count discrepancies...\n');

  try {
    const pinsSnapshot = await db.collection('pins').get();
    summary.totalPinsScanned = pinsSnapshot.size;

    for (const pinDoc of pinsSnapshot.docs) {
      const pinId = pinDoc.id;
      const pinData = pinDoc.data();
      const storedCount = typeof pinData.commentCount === 'number' ? pinData.commentCount : 0;
      const title = pinData.title || 'Untitled Pin';

      // Count actual comment documents in subcollection
      const commentsSnapshot = await db.collection('pins').doc(pinId).collection('comments').get();
      const actualCount = commentsSnapshot.size;

      if (storedCount !== actualCount) {
        summary.discrepancies.push({
          pinId,
          title,
          storedCount,
          actualCount,
        });

        console.log(`[DISCREPANCY] Pin "${title}" (${pinId}):`);
        console.log(`  - Stored commentCount : ${storedCount}`);
        console.log(`  - Actual comments docs: ${actualCount}`);

        if (!IS_DRY_RUN) {
          await pinDoc.ref.update({
            commentCount: actualCount,
            updatedAt: FieldValue.serverTimestamp(),
          });
          summary.reconciledPins++;
          console.log(`  -> Successfully updated stored commentCount to ${actualCount}\n`);
        } else {
          console.log(`  -> [DRY RUN] Would update commentCount to ${actualCount}\n`);
        }
      } else {
        summary.inSyncPins++;
      }
    }

    console.log('='.repeat(70));
    console.log(' RECONCILIATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`• Total Pins Scanned    : ${summary.totalPinsScanned}`);
    console.log(`• Already In Sync       : ${summary.inSyncPins}`);
    console.log(`• Discrepancies Found   : ${summary.discrepancies.length}`);
    console.log(`• Reconciled / Fixed    : ${summary.reconciledPins}`);
    console.log('='.repeat(70));

    return summary;
  } catch (err) {
    console.error('Error during comment count reconciliation:', err);
    throw err;
  }
}

// Direct execution
if (process.argv[1]?.endsWith('reconcile-comment-counts.ts')) {
  reconcilePinCommentCounts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
