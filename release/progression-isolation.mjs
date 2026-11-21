import { readFileSync } from 'node:fs';

const project = 'projects/rainbyte-studio';
const region = `${project}/locations/europe-west2`;
const token = process.env.HEYROQ_RELEASE_READ_TOKEN;
if (!token) throw new Error('Use the authorized Google session for the read-only isolation check');

// Include comment handlers and deletion intake because they can feed cascades.
const paths = [
  'onPinCreatedProgression', 'onPinDeleted', 'onPinLikeCreated', 'onPinLikeDeleted',
  'onPinCommentCreated', 'onPinCommentDeleted', 'onUserFollowerCreated',
  'onUserFollowerDeleted', 'onUserProfileUpdatedProgression', 'recalculateProgression',
  'deleteUserAccount', 'reconcileAccountDeletion',
];
const preflight = JSON.parse(readFileSync(
  new URL('../docs/progression-deployment-manifest.json', import.meta.url), 'utf8',
)).writerFreezePreflight;

async function get(url, body) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

function complete(response, collection) {
  if (response.nextPageToken) throw new Error(`Incomplete ${collection} inventory`);
  return response[collection] ?? [];
}

const [functions, services, jobs, triggers, subscriptions, databases] = await Promise.all([
  get(`https://cloudfunctions.googleapis.com/v2/${project}/locations/-/functions`).then(x => complete(x, 'functions')),
  get(`https://run.googleapis.com/v2/${project}/locations/-/services`).then(x => complete(x, 'services')),
  get(`https://cloudscheduler.googleapis.com/v1/${region}/jobs`).then(x => complete(x, 'jobs')),
  get(`https://eventarc.googleapis.com/v1/${project}/locations/us-west1/triggers`).then(x => complete(x, 'triggers')),
  get(`https://pubsub.googleapis.com/v1/${project}/subscriptions`).then(x => complete(x, 'subscriptions')),
  get(`https://firestore.googleapis.com/v1/${project}/databases`).then(x => complete(x, 'databases')),
]);
const job = jobs.find(item => item.name.endsWith('/heyroq-reconcile-account-deletion'));
if (!job) throw new Error('Account-deletion Scheduler destination is missing');
if (!databases.some(item => item.name === preflight.namedDatabase)) throw new Error('Named Firestore database is missing');
const byName = new Map(functions.map(item => [item.name.split('/').at(-1), item]));
const writers = paths.map(name => {
  const live = byName.get(name);
  if (!live || live.environment !== 'GEN_2') throw new Error(`Missing Gen2 endpoint ${name}`);
  const legacy = preflight.functions[name];
  const service = services.find(item => item.name === live.serviceConfig.service);
  if (!service) throw new Error(`Missing Cloud Run service for ${name}`);
  const binding = triggers.find(item => item.name === live.eventTrigger?.trigger);
  const subscription = subscriptions.find(item => item.name === binding?.transport?.pubsub?.subscription);
  if (legacy.trigger && (!binding || !subscription)) throw new Error(`Missing event delivery path for ${name}`);
  return {
    name,
    runtime: live.serviceConfig.serviceAccountEmail,
    revision: live.serviceConfig.revision,
    legacyRevision: legacy.revision,
    legacySourceStillCurrent: live.buildConfig.source.storageSource.generation === legacy.source.generation,
    traffic: service.trafficStatuses,
    eventarc: binding?.name,
    eventarcIdentity: binding?.serviceAccount,
    subscription: subscription?.name,
    scheduler: name === 'reconcileAccountDeletion'
      ? { state: job.state, uri: job.httpTarget.uri, identity: job.httpTarget.oidcToken?.serviceAccountEmail }
      : undefined,
  };
});

const directWrites = writers.filter(writer => !['onPinCommentCreated', 'onPinCommentDeleted'].includes(writer.name));
const identities = [...new Set(directWrites.map(writer => writer.runtime))].sort();
const uses = Object.fromEntries(identities.map(identity => [identity, {
  services: services.filter(item => item.template?.serviceAccount === identity).map(item => item.name),
  eventarc: triggers.filter(item => item.serviceAccount === identity).map(item => item.name),
}]));
console.log(JSON.stringify({
  databases: databases.map(item => item.name),
  writers,
  identityUses: uses,
  additionalFunctions: functions.map(item => item.name.split('/').at(-1))
    .filter(name => !Object.hasOwn(preflight.functions, name) && name !== preflight.gen1.name),
}, null, 2));

// Routes and identities are preflight information. They cannot establish
// that old processes have stopped or lost permission to commit.
process.exitCode = 2;
