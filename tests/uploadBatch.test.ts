import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadBatch } from '../src/services/uploadBatch';

test('failed upload waits for successful siblings before discarding them', async () => {
  const failure = new Error('upload failed');
  let finish!: (value: string) => void;
  const delayed = new Promise<string>(resolve => { finish = resolve; });
  const discarded: string[][] = [];
  const batch = uploadBatch(['bad', 'good'], name => name === 'bad' ? Promise.reject(failure) : delayed,
    async values => { discarded.push(values); });
  await Promise.resolve();
  assert.deepEqual(discarded, []);
  finish('stored-image');
  await assert.rejects(batch, error => error === failure);
  assert.deepEqual(discarded, [['stored-image']]);
});

test('successful upload batch preserves input order and retains files', async () => {
  const result = await uploadBatch(['b', 'a'], async value => value, async () => assert.fail('discarded'));
  assert.deepEqual(result, ['b', 'a']);
});
