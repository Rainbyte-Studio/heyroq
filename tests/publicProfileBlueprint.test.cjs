const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('public user blueprint must never declare authentication email', () => {
  const blueprint = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firebase-blueprint.json'), 'utf8'));
  const user = blueprint.entities.User;
  assert.ok(user, 'User entity must exist');
  assert.ok(!Object.hasOwn(user.properties, 'email'), 'email must not be a public user profile property');
  assert.ok(!user.required.includes('email'), 'email must not be required on public profiles');
});
