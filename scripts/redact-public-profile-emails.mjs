/**
 * One-time migration for legacy public users/{uid}.email fields.
 * Defaults to DRY RUN. Requires Firebase Admin application credentials.
 * Run with FIRESTORE_DATABASE_ID explicitly set to the named Heyroq database.
 * Use --apply only after reviewing the dry-run count.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (!databaseId || databaseId === '(default)') {
  throw new Error('Set FIRESTORE_DATABASE_ID to the explicit named Heyroq database.');
}
const apply = process.argv.includes('--apply');
initializeApp();
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
