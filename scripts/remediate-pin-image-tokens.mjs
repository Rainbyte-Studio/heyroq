import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const project = 'rainbyte-studio';
const datastore = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const bucket = 'rainbyte-studio.firebasestorage.app';
const db = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/' + datastore + '/documents';
const objects = 'https://storage.googleapis.com/storage/v1/b/' + bucket + '/o';
const media = 'https://firebasestorage.googleapis.com/v0/b/' + bucket + '/o/';
const delivery = 'https://europe-west2-rainbyte-studio.cloudfunctions.net/publicPinImageV1';
const digest = value => createHash('sha256').update(value).digest('hex');
const field = (doc, key) => Object.values(doc?.fields?.[key] ?? {})[0];
const supported = /^(?:pins\/[^/]+\/[^/]+|pin-images(?:-v2)?\/[^/]+\/[^/]+\/[^/]+\/[^/]+)$/;

function storedPath(value, owner, pinId) {
  try {
    const u = new URL(value);
    if (u.origin + u.pathname === delivery && u.searchParams.get('pin') === pinId &&
        /^[\w-]+$/.test(owner) && /^[a-f0-9-]{36}$/.test(u.searchParams.get('incarnation') ?? '') &&
        /^[a-f0-9-]{36}$/.test(u.searchParams.get('image') ?? '')) {
      return ['pin-images-v2', owner, pinId, u.searchParams.get('incarnation'), u.searchParams.get('image')].join('/');
    }
    if (u.origin + u.pathname.slice(0, new URL(media).pathname.length) !== media || u.username || u.password) return;
    return decodeURIComponent(u.pathname.slice(new URL(media).pathname.length));
  } catch { return; }
}

export function classifyPinImage(object, references) {
  if (references.length === 0) return 'orphaned';
  if (references.length !== 1 || !supported.test(object.name)) return 'ambiguous';
  const [root, owner, pinId] = object.name.split('/');
  const [{ pin, state }] = references;
  const metadata = object.metadata ?? {};
  if (owner !== field(pin, 'userId') || (root !== 'pins' && pinId !== pin.name.split('/').at(-1))) return 'ambiguous';
  if (root === 'pin-images-v2') {
    const [, , , incarnation, uploadId] = object.name.split('/');
    if (metadata.protocol !== 'server-v1' || metadata.uploadedBy !== owner || metadata.pinId !== pinId ||
        metadata.incarnation !== incarnation || metadata.uploadId !== uploadId) return 'ambiguous';
  }
  return state;
}

async function request(url, token, options) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { ...options?.headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  } catch { throw new Error('Cloud API request failed'); }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Cloud API HTTP ' + response.status);
  return response.json();
}

async function* list(endpoint, fieldName, token, filters) {
  let pageToken;
  do {
    const query = new URLSearchParams({ ...filters, ...(pageToken ? { pageToken } : {}) });
    const result = await request(endpoint + '?' + query, token);
    yield* result?.[fieldName] ?? [];
    pageToken = result?.nextPageToken;
  } while (pageToken);
}

async function inventory(token) {
  const refs = new Map();
  const counts = { public: 0, restricted: 0, ambiguous: 0, orphaned: 0, unknownUrls: 0, missingObjects: 0 };
  for await (const pin of list(db + '/pins', 'documents', token, { pageSize: '100' })) {
    const uid = field(pin, 'userId');
    const id = pin.name.split('/').at(-1);
    const hasRestrictedState = ['isPrivate', 'isDeleted', 'isDemo', 'isReported'].some(k => field(pin, k) === true) ||
      ![undefined, 'public'].includes(field(pin, 'visibility')) || ![undefined, 'published'].includes(field(pin, 'status'));
    const receipt = !hasRestrictedState && typeof uid === 'string' && field(pin, 'publishReceipt') === true
      ? await request(db + '/users/' + encodeURIComponent(uid) + '/pinPublishReceipts/' + encodeURIComponent(id), token) : null;
    const state = hasRestrictedState ? 'restricted'
      : receipt?.createTime === pin.createTime && field(receipt, 'publishedAt') ? 'public' : 'ambiguous';
    for (const item of field(pin, 'imageUrls')?.values ?? []) {
      const path = storedPath(item.stringValue, uid, id);
      if (!path || !supported.test(path)) { counts.unknownUrls++; continue; }
      const association = refs.get(path) ?? [];
      const bearer = new URL(item.stringValue).searchParams.get('token');
      association.push({ pin, state, bearer });
      refs.set(path, association);
    }
  }
  const matches = new Map();
  for (const prefix of ['pins/', 'pin-images/', 'pin-images-v2/']) {
    for await (const object of list(objects, 'items', token, { prefix, maxResults: '100',
      fields: 'nextPageToken,items(name,generation,metageneration,metadata)' })) {
      const associations = refs.get(object.name) ?? [];
      refs.delete(object.name);
      const state = classifyPinImage(object, associations);
      counts[state]++;
      if (state === 'restricted') matches.set(digest(object.name), { object, association: associations[0] });
    }
  }
  counts.missingObjects = refs.size;
  return { counts, matches };
}

async function preflight(token) {
  const api = 'https://firebaserules.googleapis.com/v1/';
  const release = await request(api + 'projects/' + project + '/releases/firebase.storage/' + bucket, token);
  const ruleset = release?.rulesetName ? await request(api + release.rulesetName, token) : null;
  const local = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();
  const worker = await request('https://cloudfunctions.googleapis.com/v2/projects/' + project +
    '/locations/europe-west2/functions/pinImageAccessV1', token);
  if (worker?.state !== 'ACTIVE' || !ruleset?.source?.files?.some(file => file.content?.replace(/\r\n/g, '\n').trim() === local)) {
    throw new Error('The owner callable or exact Storage Rules are not active');
  }
  const control = await request(db + '/progressionMaintenance/writers', token);
  if (field(control, 'mode') !== 'frozen') throw new Error('A coordinated pin write freeze is required for production apply');
}

async function apply(token, target, expected) {
  await preflight(token);
  const latest = await inventory(token);
  const candidate = latest.matches.get(target);
  const old = expected?.object;
  if (latest.counts.unknownUrls || !candidate || !old || old.generation !== candidate.object.generation ||
      old.metageneration !== candidate.object.metageneration ||
      expected.association.pin.updateTime !== candidate.association.pin.updateTime) {
    throw new Error('Candidate evidence changed or the inventory contains unrecognized image references');
  }
  const { object, association } = candidate;
  if (!/^[1-9]\d*$/.test(object.generation) || !/^[1-9]\d*$/.test(object.metageneration)) throw new Error('Invalid object generation');
  const pinId = association.pin.name.split('/').at(-1);
  const owner = field(association.pin, 'userId');
  const stored = object.metadata?.firebaseStorageDownloadTokens ?? '';
  if (object.metadata?.heyroqRestricted === '1' && (object.metadata.heyroqRestrictedOwner !== owner ||
      object.metadata.heyroqRestrictedPin !== pinId)) throw new Error('Existing ownership metadata differs');
  const encoded = encodeURIComponent(object.name);
  const oldTokens = new Set([...stored.split(','), association.bearer].filter(Boolean));
  let changed = false;
  if (stored || object.metadata?.heyroqRestricted !== '1') {
    await request(objects + '/' + encoded + '?' + new URLSearchParams({
      ifGenerationMatch: object.generation, ifMetagenerationMatch: object.metageneration,
    }), token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      cacheControl: 'private, no-store',
      metadata: { firebaseStorageDownloadTokens: null, heyroqRestricted: '1',
        heyroqRestrictedOwner: owner, heyroqRestrictedPin: pinId },
    }) });
    changed = true;
  }
  for (const oldToken of [undefined, ...oldTokens]) {
    let response;
    try {
      response = await fetch(media + encoded + '?' + new URLSearchParams({
        alt: 'media', ...(oldToken ? { token: oldToken } : {}),
      }), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      await response.body?.cancel();
    } catch { throw new Error('Unable to verify old URL revocation'); }
    if (![401, 403, 404].includes(response.status)) throw new Error('Old URL access did not fail closed');
  }
  return changed;
}

async function main() {
  const args = process.argv.slice(2);
  const token = process.env.HEYROQ_STORAGE_AUDIT_ACCESS_TOKEN;
  if (!token || !args.includes('--project=rainbyte-studio')) throw new Error('Select rainbyte-studio and an authorized Cloud session');
  const inventoryResult = await inventory(token);
  const { counts, matches } = inventoryResult;
  const target = args.find(arg => arg.startsWith('--apply='))?.slice(8);
  if (target) {
    if (!/^[a-f0-9]{64}$/.test(target) || !args.includes('--owner-client-verified')) throw new Error('Supply one reviewed digest and verified owner-client readiness');
    const changed = await apply(token, target, matches.get(target));
    console.log(JSON.stringify({ changed, checked: 1, target }));
  } else {
    console.log(JSON.stringify({ dryRun: true, counts, candidates: [...matches.keys()] }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Image inventory failed'); process.exitCode = 1; }
}
