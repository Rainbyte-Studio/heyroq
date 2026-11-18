import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearchReadCache } from '../src/services/searchReadCache';

test('search reads coalesce, expire, and invalidate after mutations', async () => {
  let now = 0;
  let reads = 0;
  const cache = createSearchReadCache(async () => ++reads, 5, () => now);
  assert.deepEqual(await Promise.all([cache.read(), cache.read()]), [1, 1]);
  assert.equal(await cache.read(), 1);
  now = 5;
  assert.equal(await cache.read(), 2);
  cache.invalidate();
  assert.equal(await cache.read(), 3);
});

test('a rejected Firestore read can be retried', async () => {
  let reads = 0;
  const cache = createSearchReadCache(async () => {
    if (++reads === 1) throw new Error('offline');
    return 'restored';
  }, 5);
  await assert.rejects(cache.read(), /offline/);
  assert.equal(await cache.read(), 'restored');
});
