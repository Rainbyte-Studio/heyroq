const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Firebase deploy configuration targets the exact Heyroq named database', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firebase.json'), 'utf8'));
  assert.equal(config.firestore.database, 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3');
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.equal(config.firestore.indexes, 'firestore.indexes.json');
});

test('Heyroq Enterprise indexes avoid unsupported Standard field overrides', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firestore.indexes.json'), 'utf8'));
  assert.deepEqual(config.fieldOverrides || [], []);
  assert.equal(config.indexes.length, 5);
  const orphanQueue = config.indexes.find(index => index.collectionGroup === 'pinImageUploadIntents');
  assert.deepEqual(orphanQueue, {
    collectionGroup: 'pinImageUploadIntents', queryScope: 'COLLECTION', apiScope: 'ANY_API', density: 'DENSE',
    fields: [
      { fieldPath: 'cleanupAfter', order: 'ASCENDING' },
      { fieldPath: '__name__', order: 'ASCENDING' },
    ],
  });
  for (const index of config.indexes.filter(index => index !== orphanQueue)) assert.equal(index.density, 'DENSE');
  for (const collectionGroup of ['likes', 'comments']) {
    assert.ok(config.indexes.some((index) => index.collectionGroup === collectionGroup &&
      index.queryScope === 'COLLECTION_GROUP' && index.fields.length === 1 &&
      index.fields[0].fieldPath === 'userId' && index.fields[0].order === 'ASCENDING'));
  }
});

