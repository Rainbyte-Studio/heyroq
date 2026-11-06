/**
 * Heyroq - User Search Fields Backfill Script
 *
 * Iterates through all existing user documents in the `users` collection.
 * Derives normalized search fields:
 * - `usernameLower`: lowercase username without leading '@'
 * - `displayNameLower`: lowercase display name
 * - `searchTokens`: array of lowercase tokens from displayName and username
 *
 * Invariants:
 * - 100% Idempotent: Only updates documents where fields are missing or incorrect.
 * - Non-destructive: Never overwrites unrelated profile fields.
 * - Supports `--dry-run` to preview changes without writing.
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
console.log(' Heyroq - User Search Fields Backfill & Normalization Tool');
console.log('='.repeat(70));
console.log(`• Project ID   : ${PROJECT_ID}`);
console.log(`• Database ID  : ${DATABASE_ID}`);
console.log(`• Mode         : ${IS_DRY_RUN ? 'DRY-RUN (Audit only)' : 'COMMITTING TO FIRESTORE'}`);
console.log('='.repeat(70) + '\n');

export function deriveUserSearchFields(data: Record<string, any>, uid: string) {
  let rawUsername = data.username;
  let rawDisplayName = data.displayName;

  if (uid === 'system_curator') {
    rawUsername = rawUsername || 'heyroq';
    rawDisplayName = rawDisplayName || 'Heyroq Editorial';
  } else {
    rawUsername = rawUsername || (data.email ? data.email.split('@')[0] : `user_${uid.slice(0, 5)}`);
    rawDisplayName = rawDisplayName || rawUsername || 'Explorer';
  }

  const cleanUsername = String(rawUsername).trim().replace(/^@/, '');
  const cleanDisplayName = String(rawDisplayName).trim();

  const usernameLower = cleanUsername.toLowerCase();
  const displayNameLower = cleanDisplayName.toLowerCase();

  // Generate unique lowercase word tokens for auxiliary search indexing
  const words = `${usernameLower} ${displayNameLower}`
    .split(/[\s,._\-@]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const searchTokens = Array.from(new Set(words));

  return {
    username: cleanUsername,
    displayName: cleanDisplayName,
    usernameLower,
    displayNameLower,
    searchTokens,
  };
}

async function runBackfill() {
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
      console.log('• Authenticated as admin user for backfill updates.\n');
    } catch (authErr) {
      console.warn('• Notice authenticating admin user:', authErr);
    }
  }

  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnap.size} user documents in 'users' collection.\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;
    const derived = deriveUserSearchFields(data, uid);

    const needsUsernameLower = data.usernameLower !== derived.usernameLower;
    const needsDisplayNameLower = data.displayNameLower !== derived.displayNameLower;
    const needsSearchTokens =
      !Array.isArray(data.searchTokens) ||
      JSON.stringify(data.searchTokens) !== JSON.stringify(derived.searchTokens);

    if (needsUsernameLower || needsDisplayNameLower || needsSearchTokens) {
      console.log(`[Update Needed] User ${uid} (${data.displayName || data.email}):`);
      if (needsUsernameLower) console.log(`  - usernameLower: "${data.usernameLower}" -> "${derived.usernameLower}"`);
      if (needsDisplayNameLower) console.log(`  - displayNameLower: "${data.displayNameLower}" -> "${derived.displayNameLower}"`);
      if (needsSearchTokens) console.log(`  - searchTokens: [${derived.searchTokens.join(', ')}]`);

      if (!IS_DRY_RUN) {
        const updatePayload: Record<string, any> = {};
        if (needsUsernameLower) updatePayload.usernameLower = derived.usernameLower;
        if (needsDisplayNameLower) updatePayload.displayNameLower = derived.displayNameLower;
        if (needsSearchTokens) updatePayload.searchTokens = derived.searchTokens;

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, updatePayload);
        console.log(`  ✓ Updated document users/${uid}\n`);
      }
      updatedCount++;
    } else {
      console.log(`[In Sync] User ${uid} (${data.displayName || data.email}) already has normalized search fields.`);
      skippedCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(' Backfill Summary:');
  console.log(`• Total Users Scanned  : ${usersSnap.size}`);
  console.log(`• Updated / Needs Fix  : ${updatedCount}`);
  console.log(`• Already In Sync      : ${skippedCount}`);
  console.log('='.repeat(70) + '\n');
}

runBackfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill error:', err);
    process.exit(1);
  });
