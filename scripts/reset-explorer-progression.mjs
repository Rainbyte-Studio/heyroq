import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [mode, backupPath, ...extra] = process.argv.slice(2);
if (!['plan', 'rehearse'].includes(mode) || !backupPath || extra.length) {
  throw new Error('Usage: node scripts/reset-explorer-progression.mjs plan|rehearse NEW_BACKUP_PATH');
}

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) {
  throw new Error('Expected a local Firestore emulator');
}
if (mode === 'rehearse' && !emulator) throw new Error('Writes require a local emulator');

const project = emulator ? 'demo-heyroq' : 'rainbyte-studio';
const database = `projects/${project}/databases/ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`;
const root = `${database}/documents`;
const base = emulator ? `http://${emulator}` : 'https://firestore.googleapis.com';
const token = emulator ? 'owner' : process.env.HEYROQ_FIRESTORE_READ_TOKEN;
if (!token) throw new Error('A Firestore read access token is required');

async function request(path, body) {
  const response = await fetch(`${base}/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path.split(':').at(-1)} failed (HTTP ${response.status})`);
  return response.json();
}

const marker = `${root}/progressionMaintenance/geography-v11-reset`;
const writerControl = `${root}/progressionMaintenance/writers`;
const profileFields = ['citiesCount', 'countriesCount'];
const deleteCollections = ['progression', 'achievements', 'xpEvents'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function inspect(transaction) {
  async function query(parent, collectionId, limit) {
    const rows = await request(`${parent}:runQuery`, {
      transaction,
      structuredQuery: { from: [{ collectionId }], limit },
    });
    return rows.flatMap(row => row.document ? [row.document] : []);
  }

  const [users, pins, posts, markers] = await Promise.all([
    query(root, 'users', 500), query(root, 'pins', 1),
    query(root, 'posts', 1), query(root, 'progressionMaintenance', 500),
  ]);
  if (users.length === 500 || markers.length === 500) throw new Error('Inventory exceeds supported size');
  if (markers.some(document => document.name === marker)) return { alreadyApplied: true };
  const control = markers.find(document => document.name === writerControl);
  if (mode === 'rehearse' && (control?.fields?.schemaVersion?.integerValue !== '1' ||
      control.fields?.mode?.stringValue !== 'frozen')) {
    throw new Error('Reset requires an explicit writer freeze');
  }
  if (pins.length || posts.length) throw new Error('Preserved pins or posts require epoch-aware writers before reset');
  const records = [];
  const profiles = [];
  for (const user of users) {
    const { fields = {} } = user;
    const [followers, following, receipts, ...collections] = await Promise.all(
      ['followers', 'following', 'pinPublishReceipts', ...deleteCollections]
        .map(collection => query(user.name, collection, 500)),
    );
    if (followers.length || following.length || receipts.length ||
        Number(fields.followersCount?.integerValue ?? fields.followersCount?.doubleValue ?? 0) !== 0) {
      throw new Error('Existing relationship or publication evidence requires epoch-aware writers before reset');
    }
    for (const collection of collections) records.push(...collection);
    const previousFields = Object.fromEntries(
      profileFields.filter(field => Object.hasOwn(fields, field)).map(field => [field, fields[field]]),
    );
    if (Object.keys(previousFields).length) profiles.push({
      name: user.name, updateTime: user.updateTime, fields: previousFields,
    });
    if (records.length + profiles.length >= 499) throw new Error('Reset exceeds the atomic write budget');
  }
  const writes = [
    ...records.map(document => ({ delete: document.name, currentDocument: { updateTime: document.updateTime } })),
    ...profiles.map(document => ({
      update: { name: document.name, fields: {} },
      updateMask: { fieldPaths: Object.keys(document.fields) },
      currentDocument: { updateTime: document.updateTime },
    })),
  ];
  const summaries = records.filter(document => document.name.endsWith('/progression/summary'));
  const positive = (document, field) => Number(document.fields?.[field]?.integerValue ??
    document.fields?.[field]?.doubleValue ?? 0) > 0;
  const achievements = records.filter(document => document.name.split('/').at(-2) === 'achievements');
  const unlocked = achievements.filter(document => document.fields?.isUnlocked?.booleanValue === true);
  return {
    database, marker, users: users.length, pins: 0, posts: 0,
    summaries: summaries.length,
    followers: 0, following: 0, publicationReceipts: 0,
    xpEvents: records.filter(document => document.name.split('/').at(-2) === 'xpEvents').length,
    achievements: achievements.length,
    unlockedAchievements: unlocked.length,
    unlockedGeography: unlocked.filter(document => document.fields?.category?.stringValue === 'Geography').length,
    positiveXp: summaries.filter(document => positive(document, 'xp')).length,
    positiveCityCounts: [...summaries, ...profiles].filter(document => positive(document, 'citiesCount')).length,
    positiveCountryCounts: [...summaries, ...profiles].filter(document => positive(document, 'countriesCount')).length,
    records, profiles, writes,
  };
}

const readOnly = mode === 'plan';
const { transaction } = await request(`${root}:beginTransaction`, {
  options: readOnly ? { readOnly: {} } : { readWrite: {} },
});
let committed = false;
try {
  const plan = await inspect(transaction);
  if (plan.alreadyApplied) {
    console.log('Reset marker already exists');
  } else {
    const path = resolve(backupPath);
    const bytes = JSON.stringify(plan, null, 2) + '\n';
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const checksum = hash(bytes);
    if (hash(await readFile(path)) !== checksum) throw new Error('Backup verification failed');
    const { records, profiles, writes, ...counts } = plan;
    console.log(JSON.stringify({ ...counts, writes: writes.length, backupSha256: checksum }));
    if (!readOnly) {
      await request(`${root}:commit`, {
        transaction,
        writes: [...writes, {
          update: { name: marker, fields: { backupSha256: { stringValue: checksum } } },
          currentDocument: { exists: false },
        }],
      });
      committed = true;
    }
  }
} finally {
  if (!committed) await request(`${root}:rollback`, { transaction });
}
