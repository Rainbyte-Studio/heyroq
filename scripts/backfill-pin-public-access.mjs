import { pathToFileURL } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const databaseId = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';

export function legacyPinDecision(pin, receipt) {
  const data = pin.data() ?? {};
  if (data.publicAccess !== undefined) return null;
  if (data.visibility !== undefined && data.visibility !== 'public') return null;
  if (data.status !== undefined && data.status !== 'published') return null;
  if (['isPrivate', 'isDeleted', 'isReported', 'isDemo'].some(key => data[key] !== undefined && data[key] !== false)) return null;
  if (data.publishReceipt !== true || !pin.createTime || !receipt?.createTime?.isEqual(pin.createTime) ||
      typeof receipt.get('publishedAt')?.toMillis !== 'function') return null;
  return { visibility: 'public', status: 'published', publicAccess: true };
}

export async function backfill(db, { apply = false } = {}) {
  const counts = { examined: 0, alreadyClassified: 0, confirmedPublic: 0, requiresReview: 0 };
  const query = db.collection('pins').orderBy(FieldPath.documentId()).limit(100);
  let after;
  for (;;) {
    const page = await (after ? query.startAfter(after) : query).get();
    for (const entry of page.docs) {
      const outcome = await db.runTransaction(async tx => {
        const pin = await tx.get(entry.ref);
        if (!pin.exists) return 'requiresReview';
        if (pin.get('publicAccess') !== undefined) return 'alreadyClassified';
        const uid = pin.get('userId');
        if (typeof uid !== 'string' || !uid || uid.includes('/') || pin.get('publishReceipt') !== true) return 'requiresReview';
        const receipt = await tx.get(db.doc('users/' + uid + '/pinPublishReceipts/' + pin.id));
        const fields = legacyPinDecision(pin, receipt);
        if (!fields) return 'requiresReview';
        if (apply) tx.update(pin.ref, fields);
        return 'confirmedPublic';
      }, { readOnly: !apply });
      counts.examined++;
      counts[outcome]++;
    }
    if (page.size < 100) return counts;
    after = page.docs.at(-1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const projectId = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
  const apply = args.includes('--apply');
  const local = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '');
  if ((local && projectId !== 'demo-heyroq') || (!local && projectId !== 'rainbyte-studio') ||
      (apply && !local && !args.includes('--confirm-production-pin-migration'))) {
    throw new Error('Specify the approved project and explicitly confirm a production apply.');
  }
  const db = getFirestore(initializeApp({ projectId }), databaseId);
  try { console.log(JSON.stringify(await backfill(db, { apply }))); }
  finally { await db.terminate(); }
}
