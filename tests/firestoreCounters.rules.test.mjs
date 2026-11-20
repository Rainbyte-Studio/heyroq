import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

import { makePinImageTransitionRules, makePinImageTransitionStorageRules } from '../scripts/pin-image-transition-rules.mjs';

const projectId = 'demo-heyroq-counter-rules';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? { storage: { rules: readFileSync('storage.rules', 'utf8') } } : {}),
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(context => {
    return setDoc(doc(context.firestore(), 'usernameRegistryState/v1'), { ready: true });
  });
});
after(async () => { if (env) await env.cleanup(); });

const profile = (overrides = {}) => ({
  uid: 'alice', username: 'alice', displayName: 'Alice',
  followersCount: 0, followingCount: 0, pinsCount: 0, role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
});
const createProfile = (client, data) => writeBatch(client)
  .set(doc(client, 'usernames', data.username), { uid: data.uid })
  .set(doc(client, 'users', data.uid), { ...data, usernameLower: data.username })
  .commit();

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
    await assertSucceeds(createProfile(alice(), profile()));
  });
  it('allows profile creation with counters omitted', async () => {
    const { followersCount, followingCount, pinsCount, ...withoutCounters } = profile();
    await assertSucceeds(createProfile(alice(), withoutCounters));
  });
  for (const field of ['followersCount', 'followingCount', 'pinsCount']) {
    it(`rejects forged profile ${field}`, async () => {
      await assertFails(createProfile(alice(), profile({ [field]: 100000 })));
    });
  }
  it('rejects profile creation by a different user', async () => {
    await assertFails(createProfile(bob(), profile()));
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
    await assertSucceeds(createProfile(alice(), profile()));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { followersCount: 100000 }));
  });
});

describe('Username registry', () => {
  it('gates signup until the registry is active without blocking ordinary legacy edits', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await deleteDoc(doc(context.firestore(), 'usernameRegistryState/v1'));
      await setDoc(doc(context.firestore(), 'users/alice'), profile());
    });
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { bio: 'Existing profile' }));
    await assertFails(createProfile(bob(), profile({ uid: 'bob', username: 'bobby' })));
    await assertFails(writeBatch(alice())
      .set(doc(alice(), 'usernames/new_name'), { uid: 'alice' })
      .update(doc(alice(), 'users/alice'), { username: 'new_name', usernameLower: 'new_name' })
      .commit());
  });

  it('rejects a standalone claim, an unclaimed profile and a duplicate claim', async () => {
    await assertFails(setDoc(doc(alice(), 'usernames/alice'), { uid: 'alice' }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), profile()));
    await assertSucceeds(createProfile(alice(), profile()));
    await assertFails(createProfile(bob(), profile({ uid: 'bob' })));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { username: 'another', usernameLower: 'another' }));
  });

  it('commits only one of two concurrent registrations for the same username', async () => {
    const results = await Promise.allSettled([
      createProfile(alice(), profile()),
      createProfile(bob(), profile({ uid: 'bob' })),
    ]);
    if (results.filter(result => result.status === 'fulfilled').length !== 1) {
      throw new Error('Exactly one registration should succeed.');
    }
  });

  it('commits an owner rename and releases the previous claim atomically', async () => {
    const client = alice();
    await assertSucceeds(createProfile(client, profile()));
    await assertSucceeds(writeBatch(client)
      .set(doc(client, 'usernames/new_name'), { uid: 'alice' })
      .update(doc(client, 'users/alice'), { username: 'new_name', usernameLower: 'new_name' })
      .delete(doc(client, 'usernames/alice'))
      .commit());
    await assertSucceeds(createProfile(bob(), profile({ uid: 'bob' })));
  });

  it('preserves legacy usernames and blocks claims of colliding legacy handles', async () => {
    await env.withSecurityRulesDisabled(async context => {
      const admin = context.firestore();
      await setDoc(doc(admin, 'users/alice'), profile({ username: 'LegacyName' }));
      await setDoc(doc(admin, 'usernames/legacyname'), { blocked: true });
    });
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { bio: 'A legacy profile' }));
    await assertFails(createProfile(bob(), profile({ uid: 'bob', username: 'legacyname' })));
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
    await assertFails(createProfile(alice(), profile()));
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
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), pin()));
    await assertFails(setDoc(doc(alice(), 'pins/spot1/comments/forged'), {
      userId: 'alice', userName: 'Someone Else', userAvatar: '',
      text: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });
  it('accepts the authenticated profile display name', async () => {
    await seedAlice();
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1'), pin()));
    await assertSucceeds(setDoc(doc(alice(), 'pins/spot1/comments/real'), {
      userId: 'alice', userName: 'Alice', userAvatar: '',
      text: 'Test', createdAt: '2026-01-01T00:00:00.000Z',
    }));
  });
});

describe('Public profile email privacy', () => {
  it('rejects email on creation', async () => {
    await assertFails(createProfile(alice(), profile({ email: 'alice@example.test' })));
  });
  it('rejects adding email to an existing profile', async () => {
    await assertSucceeds(createProfile(alice(), profile()));
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


const pinId = 'abcdefghij0123456789';
const anotherPinId = 'abcdefghij0123456790';
const incarnation = '00112233-4455-6677-8899-aabbccddeeff';
const imageUrl = 'https://firebasestorage.googleapis.com/v0/b/rainbyte-studio.firebasestorage.app/o/' +
  'pin-images-v2%2Falice%2F' + pinId + '%2F' + incarnation + '%2F' + incarnation +
  '?alt=media&token=' + incarnation;
const legacyUrl = 'https://firebasestorage.googleapis.com/v0/b/rainbyte-studio.firebasestorage.app/o/' +
  'pins%2Falice%2F123_' + incarnation + '_example.png?alt=media&token=' + incarnation;
const claim = { protocol: 'server-v1', pinId, userId: 'alice', images: [
  { uploadId: incarnation, generation: '123' },
], imageUrls: [imageUrl] };
const approvalPath = ['pinImageApprovals', incarnation];
const claimPath = ['pinImageClaims', incarnation];
const seedApproval = (overrides = {}) => env.withSecurityRulesDisabled(context =>
  setDoc(doc(context.firestore(), ...approvalPath), { claim, expiresAt: new Date(Date.now() + 60_000), ...overrides }));
const publish = (client, id = pinId, data = {}, submittedClaim = claim) => writeBatch(client)
  .set(doc(client, 'pins', id), pin({ imageIncarnation: incarnation, imageUrls: [imageUrl], ...data }))
  .set(doc(client, ...claimPath), submittedClaim)
  .commit();

it('consumes a server-verified claim once, only for the approved pin and exact URL list', async () => {
  await seedAlice();
  const client = alice();
  const pinRef = doc(client, 'pins', pinId);
  const claimRef = doc(client, ...claimPath);
  await assertFails(publish(client)); // A forged claim cannot bootstrap approval.
  await seedApproval();
  await assertFails(setDoc(pinRef, pin({ imageIncarnation: incarnation, imageUrls: [imageUrl] })));
  await assertFails(setDoc(claimRef, claim));
  await assertFails(publish(client, anotherPinId));
  await assertFails(publish(client, pinId, { imageUrls: [imageUrl, legacyUrl] }));
  await assertFails(publish(client, pinId, {}, { ...claim, images: [{ uploadId: incarnation, generation: '456' }] }));
  await assertFails(publish(bob(), pinId, { userId: 'bob' }));
  await assertSucceeds(publish(client));
  await assertFails(updateDoc(pinRef, { imageUrls: [] }));
  await assertFails(updateDoc(pinRef, { imageIncarnation: anotherPinId }));
  await assertFails(setDoc(doc(client, 'pins', anotherPinId), pin({ imageUrls: [imageUrl] })));
  await assertFails(updateDoc(claimRef, { images: [] }));
  await assertFails(deleteDoc(claimRef));
  await assertSucceeds(deleteDoc(pinRef));
  await assertFails(publish(client));
  await assertSucceeds(setDoc(pinRef, pin({ imageUrls: [] })));
});

it('keeps approvals, quotas, intents and receipts server-owned and denies expired publication', async () => {
  await seedAlice();
  const client = alice();
  const intentPath = ['pinImageUploadIntents', incarnation];
  for (const path of [approvalPath, intentPath, [...intentPath, 'receipts', incarnation],
    ['pinImageUploadQuotas', 'alice'], ['pinImageCleanupJobs', incarnation]]) {
    await assertFails(setDoc(doc(client, ...path), { userId: 'alice' }));
    await assertFails(getDoc(doc(client, ...path)));
  }
  await seedApproval({ expiresAt: new Date(Date.now() - 60_000) });
  await assertFails(publish(client));
  await seedApproval();
  await env.withSecurityRulesDisabled(context =>
    setDoc(doc(context.firestore(), 'pinImageCleanupJobs', incarnation), { status: 'pending' }));
  await assertFails(publish(client));
});

it('preserves existing legacy pin references while blocking new ones and arbitrary image URLs', async () => {
  await seedAlice();
  const client = alice();
  const existing = doc(client, 'pins', pinId);
  await env.withSecurityRulesDisabled(context =>
    setDoc(doc(context.firestore(), 'pins', pinId), pin({ imageUrls: [legacyUrl] })));
  await assertSucceeds(getDoc(existing));
  await assertSucceeds(updateDoc(existing, { title: 'Edited legacy pin' }));
  await assertFails(updateDoc(existing, { imageUrls: [imageUrl] }));
  await assertFails(setDoc(doc(client, 'pins', anotherPinId), pin({ imageUrls: [legacyUrl] })));
});

it('denies all client writes to legacy and managed Storage namespaces and preserves legacy reads',
  { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, async () => {
    const paths = ['pins/alice/old.png', 'pin-images/alice/' + pinId + '/' + incarnation + '/' + incarnation,
      'pin-images-v2/alice/' + pinId + '/' + incarnation + '/' + incarnation];
    const bytes = new Uint8Array([1]);
    const metadata = { contentType: 'image/png', customMetadata: {
      protocol: 'server-v1', uploadedBy: 'alice', pinId, incarnation, uploadId: incarnation,
    } };
    for (const path of paths) {
      const own = ref(env.authenticatedContext('alice').storage(), path);
      const other = ref(env.authenticatedContext('bob').storage(), path);
      await assertFails(uploadBytes(own, bytes, metadata));
      await assertFails(uploadBytes(other, bytes, metadata));
      await env.withSecurityRulesDisabled(context => uploadBytes(ref(context.storage(), path), bytes, metadata));
      await assertFails(uploadBytes(own, bytes, metadata));
      await assertFails(deleteObject(own));
      const publicRef = ref(env.unauthenticatedContext().storage(), path);
      if (path.startsWith('pin-images-v2/')) await assertFails(getMetadata(publicRef));
      else await assertSucceeds(getMetadata(publicRef));
    }
  });

it('transitional rules accept published legacy filenames and keep managed publication claim-bound', async () => {
  const config = { projectId };
  const rules = readFileSync('firestore.rules', 'utf8').replaceAll('\r\n', '\n');
  const storageRules = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? readFileSync('storage.rules', 'utf8').replaceAll('\r\n', '\n') : undefined;
  const transition = await initializeTestEnvironment({
    ...config, firestore: { rules: makePinImageTransitionRules(rules) },
    ...(storageRules ? { storage: { rules: makePinImageTransitionStorageRules(storageRules) } } : {}),
  });
  try {
    await seedAlice();
    await seedApproval();
    const client = transition.authenticatedContext('alice').firestore();
    const legacy = doc(client, 'pins', anotherPinId);
    for (const url of [imageUrl, legacyUrl.replace('%2Falice', '%2Fbob'), 'https://example.com/test.jpg']) {
      await assertFails(setDoc(legacy, pin({ imageUrls: [url] })));
      await assertFails(setDoc(legacy, pin({ imageUrls: [...Array(19).fill(legacyUrl), url] })));
    }
    const publishedClientUrls = Array.from({ length: 20 }, (_, index) =>
      legacyUrl.replace(`123_${incarnation}_example.png`, `123_photo_${index}.png`));
    await assertFails(setDoc(legacy, pin({ imageUrls: [...publishedClientUrls, legacyUrl] })));
    await assertFails(setDoc(legacy, pin({ imageUrls: [publishedClientUrls.slice(0, 2).join('#')] })));
    await assertFails(setDoc(legacy, pin({ imageUrls: [publishedClientUrls[0], 42] })));
    await assertFails(setDoc(legacy, pin({ imageUrls: [legacyUrl.replace('example.png', 'a'.repeat(1024) + '.png')] })));
    await assertSucceeds(setDoc(doc(client, 'pins', 'publishedClientPin01'), pin({ imageUrls: publishedClientUrls })));
    await assertSucceeds(setDoc(legacy, pin({ imageUrls: [...publishedClientUrls.slice(0, 19), legacyUrl] })));
    await assertSucceeds(publish(client));
    await assertFails(updateDoc(legacy, { imageUrls: [imageUrl] }));
    if (storageRules) {
      const legacyPath = 'pins/alice/123_photo_19.png';
      const ownerStorage = transition.authenticatedContext('alice').storage();
      const legacyObject = ref(ownerStorage, legacyPath);
      const bytes = new Uint8Array([1]);
      const metadata = { contentType: 'image/png' };
      await assertFails(uploadBytes(ref(transition.authenticatedContext('bob').storage(), legacyPath), bytes, metadata));
      await assertSucceeds(uploadBytes(legacyObject, bytes, metadata));
      await assertFails(uploadBytes(legacyObject, bytes, metadata));
      await assertFails(deleteObject(legacyObject));
      await assertFails(uploadBytes(ref(ownerStorage, 'pin-images-v2/alice/' + pinId + '/' + incarnation + '/' + incarnation),
        bytes, metadata));
    }
  } finally {
    await transition.cleanup();
    const restored = await initializeTestEnvironment({
      ...config, firestore: { rules }, ...(storageRules ? { storage: { rules: storageRules } } : {}),
    });
    await restored.cleanup();
  }
});
