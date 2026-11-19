# Heyroq Functions release with separate identities

Use the [cutover and recovery runbook](GEOGRAPHY_XP_RELEASE.md) with this plan for
the eight managed Gen 2 handlers. GitHub Actions compiles the source and checks
the typed manifest and plan. It has read-only repository permissions and no
cloud job or credentials. An authorized operator runs each separately approved
production step from the reviewed commit.

## Plan and preflight

Use Node 22 from the repository root.

```sh
node --experimental-strip-types release/verify.mjs plan > plan.json
node --experimental-strip-types release/verify.mjs snapshot > before.json
```

The first command is offline and emits argument arrays for review, not a shell
script. Replace the source placeholder with the approved immutable archive,
containing the checked-in compiled output, package manifests and source, with
dependencies installed from the lockfile by Cloud Build. Record its SHA-256,
object version, build/deployer principal and exact Cloud SDK version in the
release record. Check the candidate revision against the archive and recorded
build provenance after each deploy. Review each invocation with separate
arguments, especially the alternate delimiter and JSON in the environment
flag. Preserve approved external settings on existing services. Stop on any
unexpected timeout, ingress, scaling, traffic split, IAM or trigger change.
The existing deletion callable's timeout must match the recorded 60 seconds
before using the generated arguments. The release requires independent traffic
approval before any command that can route requests to a new revision.

Use the Functions Gen 2 control plane for managed deployments with explicit
runtime and Eventarc service accounts. The Firebase CLI 14.27.0 uses the
runtime principal for both Eventarc and Firebase-managed scheduling. Keep the
Firebase Functions predeploy hook intact. It blocks broad and per-function
Firebase deploys for this shared codebase. Firebase remains pinned to 14.27.0
for the existing emulator CI and separately approved Rules/index operations
using explicit selectors. Use an alternate Firebase config only for Rules,
with no Functions stanza. At the cloud layer, limit Functions write access to
the verified release deployer. The repository guard covers this checkout.
Older checkouts, custom configs and direct cloud permissions require access
controls and operator discipline.

The other Gen 2 progression/counter functions remain outside the eight
identity migrations. Give any approved updates to those functions their own
explicit Gen 2 release selectors and preserve their observed identities,
filters, retries and settings. Keep Gen 1 `onAuthUserDeleted` outside deploy,
rollback and deletion selectors. Apply the account deletion dependency gate
from the cutover runbook before permitting Auth deletes.

## Pending grants

Each row is an individual proposed grant. The offline plan emits the same
matrix as structured data.

| Principal | Role | Resource |
| --- | --- | --- |
| `serviceAccount:hq-evt-profile-updated@rainbyte-studio.iam.gserviceaccount.com` | `roles/eventarc.eventReceiver` | `projects/rainbyte-studio` |
| `serviceAccount:hq-evt-pin-deleted@rainbyte-studio.iam.gserviceaccount.com` | `roles/eventarc.eventReceiver` | `projects/rainbyte-studio` |
| `serviceAccount:hq-evt-avatar-finalized@rainbyte-studio.iam.gserviceaccount.com` | `roles/eventarc.eventReceiver` | `projects/rainbyte-studio` |
| `serviceAccount:hq-evt-profile-updated@rainbyte-studio.iam.gserviceaccount.com` | `roles/run.invoker` | `projects/rainbyte-studio/locations/europe-west2/services/onuserprofileupdated` |
| `serviceAccount:hq-evt-pin-deleted@rainbyte-studio.iam.gserviceaccount.com` | `roles/run.invoker` | `projects/rainbyte-studio/locations/europe-west2/services/onpindeleted` |
| `serviceAccount:hq-evt-avatar-finalized@rainbyte-studio.iam.gserviceaccount.com` | `roles/run.invoker` | `projects/rainbyte-studio/locations/us-west1/services/onaccountavatarfinalized` |
| `serviceAccount:hq-oidc-pin-reconcile@rainbyte-studio.iam.gserviceaccount.com` | `roles/run.invoker` | `projects/rainbyte-studio/locations/europe-west2/services/reconcilepinimagecleanup` |
| `serviceAccount:hq-oidc-account-reconcile@rainbyte-studio.iam.gserviceaccount.com` | `roles/run.invoker` | `projects/rainbyte-studio/locations/europe-west2/services/reconcileaccountdeletion` |

Identify the effective deployer (including impersonation or federation) first.
Review `iam.serviceAccounts.actAs` on each runtime or Eventarc SA the deployer
will attach and on each OIDC SA the Scheduler job operator will configure.
If missing, seek approval for `roles/iam.serviceAccountUser` on each required
SA resource for that verified principal. Review the build identity separately.
The Storage service agent
`serviceAccount:service-856895300361@gs-project-accounts.iam.gserviceaccount.com`
→ `roles/pubsub.publisher` → `projects/rainbyte-studio` requires separate
approval. Reconfirm the Scheduler API and its Google-managed service agent
binding, bucket location and UBLA, configured Admin bucket, named database,
runtime grants, and effective Run invoke permissions including inherited grants
and deny policies.

Keep existing Eventarc invocation working while granting the replacement
principal. Stage the new service-level grant before switching identities on
existing services. Audit effective overlap and seek separate approval for
removing any residual legacy Invoker after the switch and drain. For a new
service, avoid enabling its event producer or relying on delivery before the
service exists and the grant is verified. For the new Storage trigger, plan
for the create-to-grant interval and account for preexisting/retried events
before opening avatar uploads. A grant to the service is required even when a
role exists on another service. Browser callables retain public Run transport
with Firebase Auth authorization inside the callable.

## Scheduler HTTP and retry contract

The two reconcilers are private Functions Gen 2 HTTP endpoints. Configure one
job per endpoint in `europe-west2` using the generated settings. Use POST with
an empty body. Set both URI and OIDC audience to the verified canonical Run
service URI with no query string. Run IAM authenticates the job principal.
The handler returns 204 on completion, 405 for other methods and 500 for
unhandled worker failure. Queue-level failures that are caught by the worker
are tracked by its durable checkpoint/lease and logs.

Use UTC, attempts of 70s and 130s respectively, zero Scheduler retries and
zero max retry duration. Each worker has one instance and concurrency one.
Scheduler may redeliver. Pin cleanup uses persistent claims and generation
preconditions. Account deletion uses a 180s lease, fenced progress and
resumable phases with a 120s runtime limit. A later tick revisits remaining work.
Keep legacy adoption disabled until the previous synchronous deletion writer
and all its invocations are drained. Treat enabling it as a separately
approved and verified change to the account worker only.

Inventory jobs and triggers before changes, including any
`firebase-schedule-*` job or alternate project/region/URI pointing at these
endpoints. Resolve duplicate delivery before enabling jobs. Create new jobs
only when activation is approved and the destination is ready, since creation
can enable delivery immediately. Pause existing jobs before approved updates
when needed and recheck their paused state before resuming. The emitted HTTP
job body describes the intended configuration. It does not create or pause jobs.

## Ordered rollout and recovery

1. Record baseline revisions, source generations, traffic including tags,
   direct plus effective IAM, active trigger filters/identities, scheduled
   jobs, the published AI Studio artifact, published Rules and index state.
   Validate the old Auth trigger before deletion work. Keep deletion intake
   gated and confirm all active clients and ingress can honor the gate.
2. Upgrade `onUserProfileUpdated` in place. Confirm the existing trigger's
   named database, namespace, document pattern, location and no-retry
   semantics. Stage its replacement Invoker and coordinate traffic approval.
   After the update, verify the generation-safe candidate at 100%, account
   for every tagged or alternate ingress, and record when the last old route
   closed. Allow at least the old revision's full verified timeout from that
   timestamp and check revision logs and in-flight metrics before lifting the
   gate. If visibility is insufficient, stop the cutover. Never restore the
   path-only cleanup revision.
3. Apply the reviewed named Firestore transitional Rules and verify the
   required index is ready. Coordinate the avatar callable and verified
   retry-enabled finalize trigger with transitional Storage closure of direct
   avatar and managed pin writes. Check alternate writers, outstanding upload
   sessions and the avatar finalization/drain requirements. Stage the
   generation-safe pin delete handler and reconcile worker, drain any unsafe
   pin delete revision, then open the new pin callable with transitional
   Rules in place. Activate Scheduler jobs only after their prerequisites and
   grants are confirmed. Keep deletion intake gated.
4. Publish the approved AI Studio build that handles both deletion response
   contracts. Verify the published artifact and compatible clients, and
   confirm Rules, triggers and workers before switching deletion intake to
   the queued callable. Drain the old synchronous callable before approving
   legacy adoption. After legacy pin publishes drain, deploy final named
   Firestore Rules first, then final Storage Rules. Record both rulesets.
5. For frontend rollback, use a previously approved artifact only if it
   supports the currently enforced Rules and the active callable response
   contracts, including pending deletion and callable-only avatar upload.
   Before final pin Rules, a compatible build can use the restricted
   transition while affected flows stay gated. After final Rules, republish a
   compatible known-good build or fix forward. Keep queued deletion and
   generation-safe cleanup compatible with existing documents and clients.
   An old UI that assumes direct avatar writes, arbitrary pin references or
   synchronous deletion cannot serve as the rollback artifact.

## Read-only comparison and verification

Capture after each approved change, verify the changed endpoint and compare
the other tracked resources. An empty change list requires all captured
resources to match. For an intentional delta, compare its before and after
entries to the reviewed plan and provenance separately.

```sh
node --experimental-strip-types release/verify.mjs snapshot > after.json
node --experimental-strip-types release/verify.mjs verify after.json onUserProfileUpdated
node --experimental-strip-types release/verify.mjs compare before.json after.json onUserProfileUpdated
```

For a scheduler endpoint, add `PAUSED` or `ENABLED` to the verify command. The
cutover check expects the account worker's legacy adoption to remain off.
Snapshots use GET requests with the current gcloud access identity. 403,
network errors and unreadable referenced triggers fail the snapshot. Only
direct resource lookups allow missing resources to be recorded. The verifier
checks current mappings and direct service Invoker bindings. It cannot prove
delivery, effective policy, the historical drain, absence of alternate jobs,
or correspondence between the deployed build and the approved artifact.
Capture this evidence separately using read-only inventory and observation.
Keep the release halted on unreviewed differences. Obtain approval for any
synthetic test or active production probe.
