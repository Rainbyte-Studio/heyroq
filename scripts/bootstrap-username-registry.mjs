import { initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = 'rainbyte-studio';
const databaseId = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const apply = process.argv.includes('--apply');
const configuredProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
if (configuredProject !== projectId || process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Set GOOGLE_CLOUD_PROJECT to rainbyte-studio and use the named production database.');
}
if (apply && !process.argv.includes('--confirm-frozen-profile-writes')) {
  throw new Error('Apply requires --confirm-frozen-profile-writes after the registry-gated Rules are deployed.');
}

const db = getFirestore(initializeApp({ projectId }), databaseId);
try {
  const marker = db.doc('usernameRegistryState/v1');
  if ((await marker.get()).get('ready') === true) {
    throw new Error('The username registry is already active.');
  }

  const reservations = new Map();
  const users = db.collection('users').select('username').orderBy(FieldPath.documentId()).limit(400);
  let page = await users.get();
  while (!page.empty) {
    for (const profile of page.docs) {
      const legacyUsername = profile.get('username');
      if (typeof legacyUsername !== 'string') continue;
      const name = legacyUsername.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(name)) continue;

      if (reservations.has(name)) reservations.set(name, { blocked: true });
      else reservations.set(name, legacyUsername === name ? { uid: profile.id } : { uid: profile.id, legacyUsername });
    }
    if (page.size < 400) break;
    page = await users.startAfter(page.docs.at(-1)).get();
  }

  const blocked = [...reservations.values()].filter(entry => entry.blocked).length;
  console.log(JSON.stringify({ databaseId, existingHandles: reservations.size, collidingLegacyHandles: blocked, apply }));

  if (apply) {
    for (const [name, reservation] of reservations) {
      const ref = db.collection('usernames').doc(name);
      await db.runTransaction(async tx => {
        const before = await tx.get(ref);
        if (!before.exists || before.get('blocked') === true) {
          if (!before.exists) tx.create(ref, reservation);
          return;
        }
        if (before.get('uid') !== reservation.uid || before.get('legacyUsername') !== reservation.legacyUsername) {
          throw new Error('Existing registry data differs from the frozen profiles. Inspect the conflict before activating.');
        }
      });
    }
    await marker.create({ ready: true, activatedAt: FieldValue.serverTimestamp() });
    console.log('Username registry activated.');
  }
} finally {
  await db.terminate();
}
