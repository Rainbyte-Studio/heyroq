type Runtime = `hq-rt-${string}@rainbyte-studio.iam.gserviceaccount.com`;
type EventIdentity = `hq-evt-${string}@rainbyte-studio.iam.gserviceaccount.com`;
type SchedulerIdentity = `hq-oidc-${string}@rainbyte-studio.iam.gserviceaccount.com`;
type Endpoint = {
  region: 'europe-west2' | 'us-west1';
  runtime: Runtime;
  timeout: number;
  sizing?: { memoryMiB: number; concurrency: number; maxInstances: number };
} & (
  | { kind: 'callable' }
  | { kind: 'firestore'; identity: EventIdentity; event: 'deleted' | 'updated'; document: string }
  | { kind: 'storage'; identity: EventIdentity }
  | { kind: 'scheduler'; identity: SchedulerIdentity; cron: string; job: string }
);

export const project = 'rainbyte-studio';
export const projectNumber = '856895300361';
export const database = 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
export const bucket = 'rainbyte-studio.firebasestorage.app';
export const eventLocation = 'us-west1';
export const schedulerLocation = 'europe-west2';
export const firebaseVersion = '14.27.0';

const domain = '@rainbyte-studio.iam.gserviceaccount.com';
const uploadSizing = { memoryMiB: 512, concurrency: 2, maxInstances: 8 };
const workerSizing = { memoryMiB: 256, concurrency: 1, maxInstances: 1 };

export const endpoints = {
  onUserProfileUpdated: {
    kind: 'firestore', region: 'europe-west2', timeout: 60, event: 'updated',
    document: 'users/{userId}', runtime: `hq-rt-profile-updated${domain}`,
    identity: `hq-evt-profile-updated${domain}`,
  },
  onPinDeleted: {
    kind: 'firestore', region: 'europe-west2', timeout: 60, event: 'deleted',
    document: 'pins/{pinId}', runtime: `hq-rt-pin-deleted${domain}`,
    identity: `hq-evt-pin-deleted${domain}`,
  },
  onAccountAvatarFinalized: {
    kind: 'storage', region: 'us-west1', timeout: 60,
    runtime: `hq-rt-avatar-finalized${domain}`, identity: `hq-evt-avatar-finalized${domain}`,
  },
  uploadProfileAvatar: {
    kind: 'callable', region: 'europe-west2', timeout: 60, sizing: uploadSizing,
    runtime: `hq-rt-avatar-upload${domain}`,
  },
  reconcilePinImageCleanup: {
    kind: 'scheduler', region: schedulerLocation, timeout: 60, sizing: workerSizing,
    cron: '*/5 * * * *', job: 'heyroq-reconcile-pin-image-cleanup',
    runtime: `hq-rt-pin-reconcile${domain}`, identity: `hq-oidc-pin-reconcile${domain}`,
  },
  pinImageUpload: {
    kind: 'callable', region: 'europe-west2', timeout: 60, sizing: uploadSizing,
    runtime: `hq-rt-pin-upload${domain}`,
  },
  reconcileAccountDeletion: {
    kind: 'scheduler', region: schedulerLocation, timeout: 120, sizing: workerSizing,
    cron: '* * * * *', job: 'heyroq-reconcile-account-deletion',
    runtime: `hq-rt-account-reconcile${domain}`, identity: `hq-oidc-account-reconcile${domain}`,
  },
  deleteUserAccount: {
    kind: 'callable', region: 'europe-west2', timeout: 60,
    runtime: `hq-rt-account-delete${domain}`,
  },
} satisfies Record<string, Endpoint>;

export const ownedEndpoints: Readonly<Record<string, Endpoint>> = endpoints;
export const runResource = (name: string, region: Endpoint['region']) =>
  `projects/${project}/locations/${region}/services/${name.toLowerCase()}`;

export const invocationGrants = Object.entries(ownedEndpoints).flatMap(([name, endpoint]) => {
  if (endpoint.kind === 'callable') return [];
  const principal = `serviceAccount:${endpoint.identity}`;
  const invoker = { principal, role: 'roles/run.invoker', resource: runResource(name, endpoint.region) };
  return endpoint.kind === 'scheduler' ? [invoker] : [
    { principal, role: 'roles/eventarc.eventReceiver', resource: `projects/${project}` }, invoker,
  ];
});
