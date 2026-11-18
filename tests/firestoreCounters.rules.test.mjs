import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const projectId = 'demo-heyroq-counter-rules';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? { storage: { rules: readFileSync('storage.rules', 'utf8') } } : {}),
  });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { if (env) await env.cleanup(); });

const profile = (overrides = {}) => ({
  uid: 'alice', username: 'alice', displayName: 'Alice',
  followersCount: 0, followingCount: 0, pinsCount: 0, role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
});
const pin = (overrides = {}) => ({
  userId: 'alice', title: 'A real place', latitude: 37.98, longitude: 23.73,
  category: 'Other', createdAt: '2026-01-01T00:00:00.000Z',
  likeCount: 0, commentCount: 0, ...overrides,
});
const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const seedAlice = async () => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'users/alice'), profile());
});

it('follow and unfollow preserve both records in the same batch', async () => {
  await seedAlice();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/bob'), profile({ uid: 'bob', username: 'bob' }));
  });
  const client = alice();
  const follower = doc(client, 'users/bob/followers/alice');
  const following = doc(client, 'users/alice/following/bob');
  const createdAt = '2026-01-01T00:00:00.000Z';
  const followerData = { followerId: 'alice', createdAt };
  const followingData = { targetUserId: 'bob', createdAt };

  await assertFails(setDoc(follower, followerData));
  await assertFails(setDoc(following, followingData));
  await assertSucceeds(writeBatch(client).set(follower, followerData).set(following, followingData).commit());
  await assertFails(deleteDoc(follower));
  await assertFails(deleteDoc(following));
  await assertSucceeds(writeBatch(client).delete(follower).delete(following).commit());
});

describe('Firestore create-time server counter protection', () => {
  it('allows legitimate profile creation with zero counters', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), profile()));
  });
  it('allows profile creation with counters omitted', async () => {
    const { followersCount, followingCount, pinsCount, ...withoutCounters } = profile();
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), withoutCounters));
  });
  for (const field of ['followersCount', 'followingCount', 'pinsCount']) {
    it(`rejects forged profile ${field}`, async () => {
      await assertFails(setDoc(doc(alice(), 'users/alice'), profile({ [field]: 100000 })));
    });
  }
  it('rejects profile creation by a different user', async () => {
    await assertFails(setDoc(doc(bob(), 'users/alice'), profile()));
  });
  it('allows legitimate pin creation with zero counters', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), pin()));
  });
  it('allows pin creation with counters omitted', async () => {
    await seedAlice();
    const { likeCount, commentCount, ...withoutCounters } = pin();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), withoutCounters));
  });
  for (const field of ['likeCount', 'commentCount']) {
    it(`rejects forged pin ${field}`, async () => {
      await seedAlice();
      await assertFails(setDoc(doc(alice(), 'pins/spot1'), pin({ [field]: 100000 })));
    });
  }
  it('rejects pin creation by a different user', async () => {
    await seedAlice();
    await assertFails(setDoc(doc(bob(), 'pins/spot1'), pin()));
  });
  it('rejects client update of existing pin counters', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), pin()));
    await assertFails(updateDoc(doc(alice(), 'pins/spot1'), { likeCount: 100000 }));
  });
  it('rejects client update of existing profile counters', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), profile()));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { followersCount: 100000 }));
  });
});

describe('Account deletion lock', () => {
  const lockAlice = async () => env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'accountDeletionLocks/alice'), { status: 'deleting' });
  });

  it('blocks new pins after account deletion is locked', async () => {
    await seedAlice();
    await lockAlice();
    await assertFails(setDoc(doc(alice(), 'pins/locked-pin'), pin()));
  });

  it('blocks profile recreation after account deletion is locked', async () => {
    await lockAlice();
    await assertFails(setDoc(doc(alice(), 'users/alice'), profile()));
  });

  it('blocks forged client deletion locks', async () => {
    await assertFails(setDoc(doc(alice(), 'accountDeletionLocks/alice'), { status: 'deleting' }));
  });

  it('blocks likes while the author is locked', async () => {
    await seedAlice();
    await lockAlice();
    await assertFails(setDoc(doc(alice(), 'pins/spot1/likes/alice'), { userId: 'alice' }));
  });

  it('blocks comments while the author is locked', async () => {
    await seedAlice();
    await lockAlice();
    await assertFails(setDoc(doc(alice(), 'pins/spot1/comments/comment1'), {
      userId: 'alice', text: 'hello', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });
});

describe('Canonical comment identity', () => {
  it('rejects a forged author display name', async () => {
    await seedAlice();
    await assertFails(setDoc(doc(alice(), 'pins/spot1/comments/forged'), {
      userId: 'alice', userName: 'Someone Else', userAvatar: '',
      text: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });
  it('accepts the authenticated profile display name', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1/comments/real'), {
      userId: 'alice', userName: 'Alice', userAvatar: '',
      text: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });
});

describe('Public profile email privacy', () => {
  it('rejects email on creation', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), profile({ email: 'alice@example.test' })));
  });
  it('rejects adding email to an existing profile', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), profile()));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'alice@example.test' }));
  });
});

describe('Admin cannot reintroduce public emails', () => {
  it('rejects admin adding email to an existing profile', async () => {
    await seedAlice();
    const adminDb = env.authenticatedContext('admin', { admin: true }).firestore();
    await assertFails(updateDoc(doc(adminDb, 'users/alice'), { email: 'alice@example.test' }));
  });
});

describe('Canonical pin author identity', () => {
  const seedAliceWithAvatar = async () => env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/alice'),
      profile({ avatarUrl: 'https://example.test/alice.png' }));
  });

  it('accepts the authenticated profile name and avatar', async () => {
    await seedAliceWithAvatar();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'),
      pin({ userName: 'Alice', userAvatar: 'https://example.test/alice.png' })));
  });
  it('rejects a forged author display name', async () => {
    await seedAliceWithAvatar();
    await assertFails(setDoc(doc(alice(), 'pins/spot1'),
      pin({ userName: 'Bob', userAvatar: 'https://example.test/alice.png' })));
  });
  it('rejects a forged author avatar', async () => {
    await seedAliceWithAvatar();
    await assertFails(setDoc(doc(alice(), 'pins/spot1'),
      pin({ userName: 'Alice', userAvatar: 'https://example.test/bob.png' })));
  });
  it('rejects changing an existing pin to another identity', async () => {
    await seedAliceWithAvatar();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'),
      pin({ userName: 'Alice', userAvatar: 'https://example.test/alice.png' })));
    await assertFails(updateDoc(doc(alice(), 'pins/spot1'), { userName: 'Bob' }));
  });
  it('allows refreshing a pin to the current profile identity', async () => {
    await seedAliceWithAvatar();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'),
      pin({ userName: 'Alice', userAvatar: 'https://example.test/alice.png' })));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users/alice'), { displayName: 'Alice R.' });
    });
    await assertSucceeds(updateDoc(doc(alice(), 'pins/spot1'), { userName: 'Alice R.' }));
  });
});

describe('Pin location is fixed after creation (no repeat city/country XP)', () => {
  const located = () => pin({
    city: 'Athens', countryCode: 'GR', countryName: 'Greece', locationName: 'Plaka',
    geohash: 'sw8zm',
  });
  const changes = {
    city: { city: 'Paris' },
    countryCode: { countryCode: 'FR' },
    countryName: { countryName: 'France' },
    country: { country: 'France' },
    locationName: { locationName: 'Montmartre' },
    latitude: { latitude: 48.85 },
    longitude: { longitude: 2.35 },
    geohash: { geohash: 'u09tv' },
  };
  for (const [field, change] of Object.entries(changes)) {
    it(`rejects owner change of ${field}`, async () => {
      await seedAlice();
      await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), located()));
      await assertFails(updateDoc(doc(alice(), 'pins/spot1'), change));
    });
  }
  it('still allows owner edits to title and description', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), located()));
    await assertSucceeds(updateDoc(doc(alice(), 'pins/spot1'), {
      title: 'Better title', description: 'Updated description',
    }));
  });
  it('still allows admins to correct a pin location', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), located()));
    const adminDb = env.authenticatedContext('admin', { admin: true }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, 'pins/spot1'), { city: 'Piraeus' }));
  });
});

describe('Server geography verification receipts', () => {
  it('denies clients write access to pin verification receipts', async () => {
    await seedAlice();
    await assertFails(setDoc(doc(alice(), 'users/alice/geographyPins/spot1'), {
      verifiedAt: new Date(),
    }));
  });
});

it('pins claim a fresh image incarnation atomically and cannot reassign or reuse it', async () => {
  await seedAlice();
  const client = alice();
  const pinId = 'abcdefghij0123456789';
  const incarnation = '00112233-4455-6677-8899-aabbccddeeff';
  const pinRef = doc(client, 'pins', pinId);
  const claimRef = doc(client, 'pinImageClaims', incarnation);
  const pinData = pin({ imageIncarnation: incarnation, imageUrls: ['photo'] });
  const claimData = { pinId, userId: 'alice', images: [{ uploadId: incarnation, generation: '123' }] };
  await assertFails(setDoc(pinRef, pinData));
  await assertFails(setDoc(claimRef, claimData));
  await assertSucceeds(writeBatch(client).set(pinRef, pinData).set(claimRef, claimData).commit());
  await assertFails(updateDoc(pinRef, { imageIncarnation: '00112233-4455-6677-8899-aabbccddee00' }));
  await assertFails(updateDoc(claimRef, { images: [] }));
  await assertFails(deleteDoc(claimRef));
  await assertSucceeds(deleteDoc(pinRef));
  await assertFails(setDoc(pinRef, pinData));
  await assertSucceeds(setDoc(pinRef, pin({ imageUrls: ['legacy'] })));
});

it('upload intents and generation receipts are immutable and tied to the authenticated owner', async () => {
  const client = alice();
  const pinId = 'abcdefghij0123456789';
  const incarnation = '00112233-4455-6677-8899-aabbccddeeff';
  const uploadId = '00112233-4455-6677-8899-aabbccddee01';
  const intentPath = ['pinImageUploadIntents', incarnation];
  const intent = doc(client, ...intentPath);
  const receipt = doc(client, ...intentPath, 'receipts', uploadId);
  const data = { pinId, userId: 'alice', createdAt: serverTimestamp(), uploadIds: [uploadId] };
  await assertFails(setDoc(receipt, { generation: '123' }));
  await assertFails(setDoc(doc(bob(), ...intentPath), data));
  await assertSucceeds(setDoc(intent, data));
  await assertFails(deleteDoc(intent));
  await assertFails(setDoc(doc(bob(), ...intentPath, 'receipts', uploadId), { generation: '123' }));
  await assertFails(setDoc(doc(client, ...intentPath, 'receipts', incarnation), { generation: '123' }));
  await assertSucceeds(setDoc(receipt, { generation: '123' }));
  await assertFails(updateDoc(receipt, { generation: '456' }));
  await assertFails(deleteDoc(receipt));
});

it('an expired intent cannot commit a receipt or publish an image claim', async () => {
  await seedAlice();
  const client = alice();
  const pinId = 'abcdefghij0123456789';
  const incarnation = '00112233-4455-6677-8899-aabbccddeeff';
  const uploadId = '00112233-4455-6677-8899-aabbccddee01';
  const intentPath = ['pinImageUploadIntents', incarnation];
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), ...intentPath), {
    pinId, userId: 'alice', createdAt: new Date(Date.now() - 61 * 60_000), uploadIds: [uploadId],
  }));
  await assertFails(setDoc(doc(client, ...intentPath, 'receipts', uploadId), { generation: '123' }));
  await assertFails(writeBatch(client)
    .set(doc(client, 'pins', pinId), pin({ imageIncarnation: incarnation, imageUrls: ['photo'] }))
    .set(doc(client, 'pinImageClaims', incarnation), { pinId, userId: 'alice', images: [{ uploadId, generation: '123' }] })
    .commit());
});

it('Storage clients can only create managed objects with matching ownership metadata',
  { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, async () => {
    const pinId = 'abcdefghij0123456789';
    const incarnation = '00112233-4455-6677-8899-aabbccddeeff';
    const uploadId = incarnation;
    const path = ['pin-images', 'alice', pinId, incarnation, uploadId].join('/');
    const own = ref(env.authenticatedContext('alice').storage(), path);
    const other = ref(env.authenticatedContext('bob').storage(), path);
    const bytes = new Uint8Array([1]);
    const metadata = {
      contentType: 'image/png',
      customMetadata: { uploadedBy: 'alice', pinId, incarnation, uploadId },
    };
    await assertFails(uploadBytes(other, bytes, metadata));
    await assertFails(uploadBytes(own, bytes, { ...metadata, customMetadata: { ...metadata.customMetadata, pinId: "wrong" } }));
    await assertSucceeds(uploadBytes(own, bytes, metadata));
    await assertFails(uploadBytes(own, bytes, metadata));
    await assertFails(deleteObject(own));
  });
