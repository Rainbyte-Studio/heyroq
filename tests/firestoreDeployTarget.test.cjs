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
