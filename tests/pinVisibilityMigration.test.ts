import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyPinDecision } from '../scripts/backfill-pin-public-access.mjs';

test('backfill approves only publication proven by the same server commit', () => {
  const time = { isEqual: (other: unknown) => time === other };
  const pin = (data: object) => ({ data: () => ({ publishReceipt: true, ...data }), createTime: time });
  const receipt = { createTime: time, get: () => time };
  assert.deepEqual(legacyPinDecision(pin({}), receipt), { publicAccess: true, visibility: 'public', status: 'published' });
  for (const state of [{ visibility: 'private' }, { visibility: 'unlisted' }, { status: 'draft' }, { status: 'archived' },
    { isDeleted: true }, { isPrivate: true }, { isDemo: true }, { isReported: true }, { publicAccess: false },
    { publishReceipt: false }]) assert.equal(legacyPinDecision(pin(state), receipt), null);
  assert.equal(legacyPinDecision(pin({}), null), null);
  assert.equal(legacyPinDecision(pin({}), { ...receipt, get: () => undefined }), null);
});
