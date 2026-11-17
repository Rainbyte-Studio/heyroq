import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-heyroq-counter-rules';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { if (env) await env.cleanup(); });

const profile = (overrides = {}) => ({
  uid: 'alice', username: 'alice', displayName: 'Alice', email: 'alice@example.test',
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
