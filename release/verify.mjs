import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { bucket, database, eventLocation, firebaseVersion, invocationGrants,
  ownedEndpoints, project, projectNumber, runResource, schedulerLocation } from './identities.ts';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const domain = {
  functions: 'https://cloudfunctions.googleapis.com/v2/',
  run: 'https://run.googleapis.com/v2/',
  events: 'https://eventarc.googleapis.com/v1/',
  scheduler: 'https://cloudscheduler.googleapis.com/v1/',
};

function eventSpec(endpoint) {
  if (endpoint.kind === 'storage') return {
    type: 'google.cloud.storage.object.v1.finalized', filters: { bucket }, retry: true,
  };
  if (endpoint.kind === 'firestore') return {
    type: `google.cloud.firestore.document.v1.${endpoint.event}`,
    filters: { database, namespace: '(default)' }, document: endpoint.document, retry: false,
  };
}

function plan() {
  const release = read('docs/progression-deployment-manifest.json');
  const config = read('firebase.json');
  const hooks = config.functions.flatMap(codebase => codebase.predeploy ?? []);
  assert.equal(config.firestore.database, database);
  assert.ok(hooks.some(hook => hook.includes('release/block-firebase-functions.cjs')));
  assert.equal(release.project, project);
  assert.equal(release.firestore.database, database);
  const handlers = readFileSync('functions/src/index.ts', 'utf8');
  for (const [name, endpoint] of Object.entries(ownedEndpoints)) {
    const candidate = release.functions[name];
    assert.equal(candidate.region ?? release.region, endpoint.region);
    assert.equal(candidate.desiredTimeoutSeconds, endpoint.timeout);
    const event = eventSpec(endpoint);
    if (event) {
      assert.equal(candidate.trigger.type, event.type);
      assert.equal(candidate.trigger.location, eventLocation);
      assert.equal(candidate.trigger.retryPolicy,
        event.retry ? 'RETRY_POLICY_RETRY' : 'RETRY_POLICY_DO_NOT_RETRY');
      if (event.document) assert.equal(candidate.trigger.document, event.document);
      else assert.equal(candidate.trigger.bucket, bucket);
    }
    const handler = { callable: 'onCall', firestore: endpoint.event === 'updated'
      ? 'onDocumentUpdated' : 'onDocumentDeleted', storage: 'onObjectFinalized',
    scheduler: 'scheduledWorker' }[endpoint.kind];
    assert.ok(handlers.includes(`export const ${name} = ${handler}(`), name);
    if (endpoint.kind === 'scheduler') {
      assert.equal(candidate.trigger.type, 'schedule');
      assert.equal(candidate.trigger.schedule, endpoint.cron);
      assert.equal(candidate.trigger.retryCount, 0);
      assert.equal(candidate.trigger.timeZone, 'UTC');
      assert.equal(candidate.maxInstances, endpoint.sizing.maxInstances);
    }
  }

  const functions = Object.fromEntries(Object.entries(ownedEndpoints).map(([name, endpoint]) => {
    const event = eventSpec(endpoint);
    const args = ['functions', 'deploy', name, '--gen2', `--project=${project}`,
      `--region=${endpoint.region}`, '--runtime=nodejs22', `--entry-point=${name}`,
      '--source=<reviewed immutable functions archive>',
      `--run-service-account=${endpoint.runtime}`, `--timeout=${endpoint.timeout}s`,
      `--update-env-vars=^|^FIRESTORE_DATABASE_ID=${database}|FIREBASE_CONFIG=${JSON.stringify({ projectId: project, storageBucket: bucket })}`];
    if (endpoint.sizing) {
      const { memoryMiB, concurrency, maxInstances } = endpoint.sizing;
      args.push(`--memory=${memoryMiB}Mi`, '--cpu=1', `--concurrency=${concurrency}`,
        `--max-instances=${maxInstances}`);
    }
    if (event) {
      args.push(`--trigger-location=${eventLocation}`, `--trigger-service-account=${endpoint.identity}`,
        `--trigger-event-filters=type=${event.type},${Object.entries(event.filters).map(([key, val]) => `${key}=${val}`).join(',')}`);
      if (event.document) args.push(`--trigger-event-filters-path-pattern=document=${event.document}`);
      if (event.retry) args.push('--retry');
    } else {
      args.push('--trigger-http');
      args.push(endpoint.kind === 'scheduler' ? '--no-allow-unauthenticated' : '--allow-unauthenticated');
    }
    const scheduler = endpoint.kind === 'scheduler' ? {
      name: `projects/${project}/locations/${schedulerLocation}/jobs/${endpoint.job}`,
      schedule: endpoint.cron, timeZone: 'UTC', retryConfig: { retryCount: 0, maxRetryDuration: '0s' },
      attemptDeadline: `${endpoint.timeout + 10}s`,
      httpTarget: { httpMethod: 'POST', uri: '<verified Run service URI>',
        oidcToken: { serviceAccountEmail: endpoint.identity, audience: '<same Run service URI>' } },
    } : undefined;
    return [name, { operatorDeployArgs: args, scheduler }];
  }));
  return { project, projectNumber, firebaseVersion, functions, invocationGrants };
}

async function snapshot() {
  const token = execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }).trim();
  async function get(api, resource, missing = false) {
    const res = await fetch(domain[api] + resource, { headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000) });
    if (res.status === 404 && missing) return null;
    if (!res.ok) throw new Error(`GET ${api}/${resource}: HTTP ${res.status}`);
    return res.json();
  }
  const names = new Set([...Object.keys(read('docs/progression-deployment-manifest.json').functions)]);
  const resources = {};
  for (const name of names) {
    const endpoint = ownedEndpoints[name];
    const region = endpoint?.region ?? 'europe-west2';
    const base = `projects/${project}/locations/${region}`;
    const fn = await get('functions', `${base}/functions/${name}`, true);
    const path = runResource(name, region);
    const run = await get('run', path, !fn);
    const iam = run && await get('run', `${path}:getIamPolicy?options.requestedPolicyVersion=3`);
    const event = fn?.eventTrigger?.trigger && await get('events', fn.eventTrigger.trigger);
    const job = endpoint?.kind === 'scheduler' && await get('scheduler',
      `projects/${project}/locations/${schedulerLocation}/jobs/${endpoint.job}`, true);
    const sc = fn?.serviceConfig;
    const env = sc?.environmentVariables;
    resources[name] = {
      function: fn && { entryPoint: fn.buildConfig?.entryPoint, runtime: fn.buildConfig?.runtime,
        service: sc?.service, identity: sc?.serviceAccountEmail, timeout: sc?.timeoutSeconds,
        concurrency: sc?.maxInstanceRequestConcurrency, maxInstances: sc?.maxInstanceCount,
        memory: sc?.availableMemory, state: fn.state, trigger: fn.eventTrigger,
        source: fn.buildConfig?.sourceProvenance?.resolvedStorageSource,
        cpu: sc?.availableCpu, ingress: sc?.ingressSettings,
        database: env?.FIRESTORE_DATABASE_ID, storageBucket: env?.FIREBASE_CONFIG && JSON.parse(env.FIREBASE_CONFIG).storageBucket,
        legacyAdoption: env?.ACCOUNT_DELETION_LEGACY_ADOPTION },
      run: run && { identity: run.template?.serviceAccount, uri: run.uri,
        latestReadyRevision: run.latestReadyRevision, traffic: run.trafficStatuses,
        invokerIamDisabled: run.invokerIamDisabled ?? false,
        invokers: (iam.bindings ?? []).filter(binding => binding.role === 'roles/run.invoker') },
      event: event ? { identity: event.serviceAccount, destination: event.destination,
        filters: (Array.isArray(event.eventFilters) ? event.eventFilters :
          Object.entries(event.eventFilters ?? {}).map(([attribute, value]) => ({ attribute, value })))
          .map(({ attribute, value, operator }) => ({ attribute, value, operator: operator || undefined }))
          .sort((a, b) => a.attribute.localeCompare(b.attribute)) } : null,
      job: job && { name: job.name, state: job.state, schedule: job.schedule, timeZone: job.timeZone,
        attemptDeadline: job.attemptDeadline, retryConfig: job.retryConfig, method: job.httpTarget?.httpMethod,
        uri: job.httpTarget?.uri, oidc: job.httpTarget?.oidcToken },
    };
  }
  return { project, resources };
}

function verify(state, name, jobState) {
  assert.equal(state.project, project);
  const endpoint = ownedEndpoints[name];
  assert.ok(endpoint, 'Unknown managed endpoint');
  const { function: fn, run, event, job } = state.resources[name];
  assert.equal(fn.state, 'ACTIVE');
  assert.equal(fn.entryPoint, name);
  assert.equal(fn.runtime, 'nodejs22');
  assert.equal(fn.service, runResource(name, endpoint.region));
  assert.equal(fn.identity, endpoint.runtime);
  assert.equal(run.identity, endpoint.runtime);
  assert.equal(fn.timeout, endpoint.timeout);
  assert.equal(fn.database, database);
  assert.equal(fn.storageBucket, bucket);
  assert.equal(run.invokerIamDisabled, false);
  assert.ok(fn.source?.generation, 'Record source provenance');
  const routed = run.traffic.filter(target => target.percent > 0);
  assert.equal(routed.length, 1);
  assert.equal(routed[0].percent, 100);
  assert.equal(routed[0].revision.split('/').at(-1), run.latestReadyRevision.split('/').at(-1));
  assert.ok(run.traffic.every(target => !target.tag), 'Review tagged revision ingress before cutover');
  if (endpoint.sizing) {
    assert.equal(fn.concurrency, endpoint.sizing.concurrency);
    assert.equal(fn.maxInstances, endpoint.sizing.maxInstances);
    assert.equal(fn.cpu, '1');
    assert.ok([endpoint.sizing.memoryMiB + 'M', endpoint.sizing.memoryMiB + 'Mi'].includes(fn.memory));
  }
  const expectedInvoker = endpoint.kind === 'callable' ? 'allUsers' : `serviceAccount:${endpoint.identity}`;
  assert.equal(run.invokers.length, 1);
  assert.equal(run.invokers[0].condition, undefined);
  assert.deepEqual(run.invokers[0].members, [expectedInvoker]);
  const spec = eventSpec(endpoint);
  if (spec) {
    assert.equal(fn.trigger.triggerRegion, eventLocation);
    assert.equal(fn.trigger.eventType, spec.type);
    assert.equal(fn.trigger.serviceAccountEmail, endpoint.identity);
    assert.equal(fn.trigger.retryPolicy ?? 'RETRY_POLICY_DO_NOT_RETRY',
      spec.retry ? 'RETRY_POLICY_RETRY' : 'RETRY_POLICY_DO_NOT_RETRY');
    const filter = (attribute, value, operator) => ({ attribute, value, operator: operator || undefined });
    assert.deepEqual((fn.trigger.eventFilters ?? []).map(f => filter(f.attribute, f.value, f.operator))
      .sort((a, b) => a.attribute.localeCompare(b.attribute)), [
      ...Object.entries(spec.filters).map(([key, val]) => filter(key, val)),
      ...(spec.document ? [filter('document', spec.document, 'match-path-pattern')] : []),
    ].sort((a, b) => a.attribute.localeCompare(b.attribute)));
    assert.equal(event.identity, endpoint.identity);
    if (event.destination.cloudFunction) assert.equal(event.destination.cloudFunction,
      `projects/${project}/locations/${endpoint.region}/functions/${name}`);
    else {
      assert.equal(event.destination.cloudRun.service, name.toLowerCase());
      assert.equal(event.destination.cloudRun.region, endpoint.region);
      assert.ok(!event.destination.cloudRun.path || event.destination.cloudRun.path === '/');
    }
    const filters = { type: spec.type, ...spec.filters, ...(spec.document ? { document: spec.document } : {}) };
    assert.deepEqual(event.filters.map(f => ({ ...f, operator: f.operator || undefined })), Object.entries(filters).map(([attribute, value]) => ({
      attribute, value, operator: attribute === 'document' ? 'match-path-pattern' : undefined,
    })).sort((a,b) => a.attribute.localeCompare(b.attribute)));
  } else {
    assert.equal(fn.trigger, undefined);
    assert.equal(event, null);
  }
  if (endpoint.kind === 'scheduler') {
    assert.ok(['PAUSED', 'ENABLED'].includes(jobState), 'Specify expected Scheduler state');
    assert.equal(job.state, jobState);
    assert.equal(job.schedule, endpoint.cron);
    assert.equal(job.timeZone, 'UTC');
    assert.equal(job.retryConfig?.retryCount ?? 0, 0);
    assert.equal(job.retryConfig?.maxRetryDuration ?? '0s', '0s');
    assert.equal(job.attemptDeadline, `${endpoint.timeout + 10}s`);
    assert.equal(job.method, 'POST');
    assert.equal(job.uri, run.uri);
    assert.equal(job.oidc.serviceAccountEmail, endpoint.identity);
    assert.equal(job.oidc.audience, run.uri);
    if (name === 'reconcileAccountDeletion') assert.notEqual(fn.legacyAdoption, 'true');
  }
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'plan' && args.length === 0) console.log(JSON.stringify(plan(), null, 2));
else if (mode === 'snapshot' && args.length === 0) console.log(JSON.stringify(await snapshot(), null, 2));
else if (mode === 'verify' && (args.length === 2 || args.length === 3)) verify(read(args[0]), args[1], args[2]);
else if (mode === 'compare' && args.length >= 2) {
  const [before, after, ...changed] = args;
  const previous = read(before), current = read(after);
  assert.equal(previous.project, project);
  assert.equal(current.project, project);
  assert.deepEqual(Object.keys(previous.resources).sort(), Object.keys(current.resources).sort());
  for (const name of changed) assert.ok(ownedEndpoints[name], `Unknown managed endpoint ${name}`);
  for (const name of Object.keys(previous.resources)) {
    if (!changed.includes(name)) assert.deepEqual(current.resources[name], previous.resources[name], name);
  }
} else throw new Error('Use plan, snapshot, verify <snapshot> <endpoint> [PAUSED|ENABLED], or compare <before> <after> [changed endpoints...]');
