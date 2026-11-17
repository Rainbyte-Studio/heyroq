/**
 * One-time migration for legacy public users/{uid}.email fields.
 * Defaults to DRY RUN. Requires Firebase Admin application credentials.
 * Run with FIRESTORE_DATABASE_ID explicitly set to the named Heyroq database.
 * Use --apply only after reviewing the dry-run count.
 */
import { initializeApp } from 'firebase-admin/app';

const EXPECTED_PROJECT_ID = 'rainbyte-studio';
const EXPECTED_DATABASE_ID = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (databaseId !== EXPECTED_DATABASE_ID) {
  throw new Error('Refusing migration: FIRESTORE_DATABASE_ID must match the exact Heyroq named database.');
}
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (projectId !== EXPECTED_PROJECT_ID) {
  throw new Error('Refusing migration: explicitly set GOOGLE_CLOUD_PROJECT=rainbyte-studio.');
}
if (process.argv.includes('--apply') && !process.argv.includes('--confirm-project=rainbyte-studio')) {
  throw new Error('Applying changes requires --confirm-project=rainbyte-studio.');
}
const apply = process.argv.includes('--apply');
initializeApp({ projectId: EXPECTED_PROJECT_ID });
const db = getFirestore(databaseId);
let cursor;
let scanned = 0;
let candidates = 0;
let removed = 0;

while (true) {
  let query = db.collection('users').orderBy('__name__').limit(200);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  const batch = db.batch();
  let pageRemovals = 0;
  for (const doc of page.docs) {
    scanned++;
    if (Object.prototype.hasOwnProperty.call(doc.data(), 'email')) {
      candidates++;
      pageRemovals++;
      if (apply) batch.update(doc.ref, { email: FieldValue.delete() });
    }
  }
  if (apply && pageRemovals) {
    await batch.commit();
    removed += pageRemovals;
  }
  cursor = page.docs[page.docs.length - 1];
  console.log(JSON.stringify({ scanned, candidates, removed, mode: apply ? 'apply' : 'dry-run' }));
}
console.log(JSON.stringify({ completed: true, databaseId, scanned, candidates, removed, mode: apply ? 'apply' : 'dry-run' }));
