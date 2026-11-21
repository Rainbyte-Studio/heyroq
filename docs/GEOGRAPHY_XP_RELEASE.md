# Geographic XP rollout and recovery

## Frontend availability and verified badge progress

For a frontend-only release, use the existing Frontend Release Candidate
workflow with `production_profile=true` after verifying geographic awarding
on the target backend. Check `COMMIT`, `SHA256SUMS` and
`BUILD_PROFILE=geography-v11-maps-configured`. This profile builds with
`VITE_GEOGRAPHY_V11_AVAILABLE=true`. Verify the staged bundle and routing
before moving traffic. An omitted or false flag keeps locked geographic badges
in Coming Soon. Earned badges continue to use the saved unlock record.

The signed-in user's achievements modal reads the existing owner/admin-only
`progressionV11/{uid}/xpEvents` geographic ledger. City and country badge bars
count the corresponding `geo_v1:city:` and `geo_v1:country:` documents.
A server-confirmed empty result shows zero. A cached or pending snapshot cannot
establish a count. Legacy lifetime summary counts are independent. This release
uses the existing rules and ledger and needs no Functions deployment or data
backfill.

## Production observation on 2026-11-21

The manifest's `productionObservation` records the revisions, source generations,
runtime identities and Eventarc bindings read from production. Earlier preflight
entries below and elsewhere in the manifest describe historical observations.
The production observation is not an approved deployment or recovery manifest.

Cloud Run served 100% of frontend traffic on `heyroq-00029-pnc`. The public HTML
and its main JavaScript and CSS matched the corresponding files in source
generation `1795197505290532`. The archive contains built assets. A Git source
match and compatibility with the v1.1 Rules and callable functions remain open.

The active pin-create source archive, generation `1795114031122615`, has SHA-256
`c0d260599de451047e660d97316760988d77f002889c766d16b1ebd495df7f0d`.
Its compiled entry differs from `main` and has legacy geography handling without
recognition of the v1.1 `geo_v1:*` ledger IDs. Keep this archive as evidence of
what is running. Recovery after activation requires a new, locked artifact that
can suspend new awards while preserving those IDs, lifetime XP, both geography
counts and unlocked badges across every progression writer.

## v1.1 recovery runtime

The recovery package uses the v1.1 reader and a compiled policy that always
returns `undefined`. The internal award helper accepts a policy in emulator
tests. None of the deployed triggers or callables accept one from their input.
Recalculation keeps the ledger, lifetime counters and unlocked badges. New
publication, likes, comments and follows continue through ordinary progression.

The Functions workflow installs locked dependencies, rebuilds on Node 22,
checks that the compiled runtime matches Git and runs the recovery regression
against one persistent emulator database. It records v1.1 awards, then replays
the compiled public entry points with awards disabled and checks the complete
geographic ledger, all seven badges, lifetime counts and ordinary progression.
After the suite passes, it publishes a commit-addressed tar and `SHA256SUMS`.
Verify the checksum and recover from that archive rather than an older revision.

Runtime recovery validation and deployment verification are separate. Before
changing traffic, capture the effective named Rules release, verify frontend
compatibility with recovery, and prepare a per-function release plan. For each
existing writer, compare the current Functions API, Cloud Run and Eventarc
settings against the production observation. Update the existing function in
place while preserving its runtime identity, trigger identity and filters,
retry policy, timeout, resources, concurrency and instance limits. Confirm the
settings and routed revision after each update. The new pin-update writer has
no prior production binding. Verify its destination and identity before any
activation. The local regression checks the compiled trigger contracts. It
does not establish that a production update will preserve live bindings.

The Functions runtime has no writer for new `UNIQUE_CITY` or `UNIQUE_COUNTRY`
ledger events and no geography provider or receipt creation path. Historical XP
and ledger documents are preserved by progression. Geography counts retain the
greater of their stored and ledger-derived values. Unlocked geographic badges
remain unlocked, and geography progress is derived from earned records; the
paused runtime cannot unlock new geographic badges or award their XP. Account
deletion still removes the departing account's data.

## Scope and evidence

The checked-in Functions runtime and source maps must match a build
with the locked toolchain. CI checks their parity with TypeScript.

See [the deployment manifest](progression-deployment-manifest.json) for the
existing endpoints, image and avatar upload callables, the avatar finalize
trigger and the two reconciliation schedulers. Upgrade Gen2
`onUserProfileUpdated` in place. Keep the Gen1 `onAuthUserDeleted` dependency
outside deploy, rollback and deletion selectors.

The follow-up Cloud Run view showed the three additional endpoints at 100% on
the recorded revisions. They shared pin-create's legacy source generation and
image digest. The Eventarc details confirmed the two bindings, named database,
namespace and document filters.

- The legacy engine can directly award from current pin labels when called by
  pin create, both like handlers, both follower handlers, pin delete, a bio or
  avatar change, or authenticated recalculation. The old tracked
  `functions/lib/index.js` at the approved base also contained this engine.
- Both comment handlers update the comment counter. Account deletion has no
  direct XP writer but can fan out into like deletes, follower deletes and pin
  deletes; comment deletes update counters. Test the surviving users as well
  as suppression of delayed events for the deleted user.
- Firebase Functions resolves the compiled entry module from
  `functions/package.json`. Rebuild from the lockfile, and reject any difference
  from the checked-in runtime. Do not copy the old compiled directory into the
  release package. The frontend's legacy client-side geographic preview math
  does not write the server ledger.

## Local verification

The prior CI results do not cover this candidate. Before running the existing
suites with authorization, align their assertions with the queued deletion
response and scheduler, live-preserved callable timeout, idempotent slot
replay, and existing-parent comment rules. The existing suites and fixtures
were left untouched for this handoff.

Use Node 22, Java 21, and the repository's locked dependencies. Build Functions,
run the location unit tests, and run the progression suite with CLI 14.27.0
against the Firestore, Auth and Storage emulators in `demo-heyroq`. The exact
invocation and environment are in
[the Functions workflow](../.github/workflows/functions-build.yml). The
integration suite invokes the compiled handlers and replays deliveries against
local persistent state. It validates SDK endpoint metadata, not deployed
Eventarc scheduling, redelivery timing, or service IAM.

## First rollout approval and sequence

1. Pin the reviewed release commit and archive SHA-256. Capture GET output for
   every Functions v2 endpoint, its Cloud Run service/active revisions, and
   each Eventarc trigger in the manifest. Attach the source generation or image
   and build identity, runtime and trigger service accounts, Cloud Run traffic,
   timeout, resources, settings, filters and retries. Compare the manifest to
   this snapshot and stop on drift or unresolved identity.
2. Match the recorded Functions API no-retry settings, including `onPinDeleted`,
   `onUserProfileUpdatedProgression` and `onUserProfileUpdated`. Record Pub/Sub
   backoff separately. Preserve the observed `deleteUserAccount` timeout of
   60 seconds and capture its other runtime options. Verify settings before
   and after each update.
3. Follow the [pin image cutover](#pin-image-release-sequence) for the order of
   Rules, Functions and the AI Studio frontend. After production approval,
   deploy explicitly selected Functions from the same immutable package. Use
   the explicit project `rainbyte-studio` and the verified CLI identity. Review
   any CLI proposal for enabling APIs or changing IAM separately.
4. Function updates are non-atomic. Treat the interval as a mixed-version
   window. Existing requests, deliveries and cascades may still reach an old
   revision. A freeze from the first instant requires a separately approved
   mechanism to stop old invocations and drain in-flight work; client write
   quiescence alone does not cover scheduled retries or authenticated
   recalculations. Claim the freeze only after the affected progression
   endpoints are verified on safe code,
   traffic no longer routes to old revisions, and any in-flight legacy
   executions have drained. On partial failure, inventory the manifest endpoints,
   halt further release steps and use the approved safe recovery path.
5. Compare the APIs with the manifest after rollout, including retry policy,
   bindings, traffic and source identities. With separate approval for test data
   writes, use disposable accounts to exercise pin create/delete, like/comment/
   follow add/remove, a profile change, recalculation and account deletion.
   Compare before/after ledger event IDs, ordinary XP, counters, and achievement
   state. Verify no new city/country entries or receipts. Monitor handler
   failures and Eventarc delivery while verifying the result.

## Progression recovery

Before the first cutover, preserve the locally tested release source as the
recovery baseline. Package the pinned revision with
`git -c core.autocrlf=false archive`, record its
commit and SHA-256, and test from a clean extraction with the same locked
dependencies, compiled runtime comparison, and emulator commands. Use the same
manifest to redeploy this package for partial or failed deployment recovery.
This is a forward recovery at first cutover. It cannot fix a defect shared by
the release and recovery baseline. If that occurs, keep the rollout halted and
test a corrected freeze-safe artifact before seeking approval.

After the first cutover passes verification, record the exact Functions v2
source generations and Eventarc configuration of that verified baseline. A
future rollback can redeploy the retained, verified safe source through
Functions so the event and runtime configuration is reconciled together.
The previously active `onpincreatedprogression-00001-zad` and the other
geography-writing legacy revisions are ineligible. Changing Cloud Run traffic
alone does not restore Functions API or Eventarc retry configuration.

## AI Studio frontend provenance and restoration

The frontend preflight identifies active revision `heyroq-00022-nf2` in
`us-west1`, source generation `1795026802945651`, and archive SHA-256
`74b7a1c9b05002af3e6fc64fbc74f9f3d79aeba71a5a7ddbb3f181e3f31547c4`.
It matched the public HTML and JS to the archive. The previous revision
`heyroq-00021-qhf` was Ready at 0%. Both revisions use legacy upload behavior
and are ineligible for rollback after the managed image cutover. The approved
Git build and two older candidates did not reproduce the published assets
under the tested conditions.

- A follow-up console read confirmed that `heyroq-00022-nf2` still received
  100% of traffic and exposed the same pinned source archive, with no build
  information on the revision. AI Studio Versions shows a candidate editor
  snapshot at `2026-11-18T18:32:44.086169Z`, 39 seconds before the deployment
  shown by Cloud Run. The GitHub panel shows the `main` connection with updates
  available to pull. Neither panel ties the published revision to a Git SHA.
  Snapshot download was not available in this review, so byte-level source
  comparison is pending.
- Read the Cloud Run revision and its audit event. Follow the pinned source
  object generation or build/image reference, and read Cloud Build provenance
  if a build ID exists. Require a commit SHA tied to that exact output, or a
  publish-linked AI Studio editor snapshot whose complete source and build
  inputs can be matched to an immutable Git tree. Record platform, lockfile,
  command and non-secret build inputs. A current GitHub connection, an editor
  export taken after publishing, or a matching public asset alone leaves the
  historical SHA unresolved. A source-deployed revision with
  `imageDigest: scratch` can still be identified by its pinned archive.
- For a future publish, capture the editor snapshot and immutable Git tree
  before the approved publish, then record the returned revision, archive
  generation/hash and served asset hashes. Treat Git provenance and
  recoverability of the deployed artifact as separate acceptance checks.
- Immediately before an approved frontend change, record the live revision,
  traffic, readiness, runtime dependencies and public hashes. Stage a
  compatible frontend from the verified artifact with zero traffic before
  final Rules enforcement. Record its image digest and revision, and validate
  it against the intended Rules, callable endpoints and client origin. After
  separate traffic approval, route to that verified revision and check
  `status.traffic`, HTTP health, served hashes and domain routing. A traffic
  update restores the published artifact. The AI Studio editor snapshot has
  its own restoration path.

[AI Studio Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)
· [Cloud Build results](https://docs.cloud.google.com/build/docs/view-build-results)
· [Cloud Run revisions](https://docs.cloud.google.com/run/docs/managing/revisions)
· [Cloud Run rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)

## Google Geocoding approval gate

Google describes [reverse geocoding](https://developers.google.com/maps/documentation/geocoding/reverse-geocoding)
as an estimate of a nearby addressable location. It cannot establish polygon
containment or reliably distinguish every coastal or border coordinate.
A future Google integration would require an explicit product decision that
city and country XP is based on an estimated pin location. If strict
containment is required, keep awards paused for this provider.

Verify the billing account address and the governing agreement. The
[EEA terms §3.2.3](https://cloud.google.com/terms/maps-platform/eea) and
[standard terms §3.2.3](https://cloud.google.com/maps-platform/terms)
restrict creating content based on Google Maps Content. The
[EEA Geocoding terms §6](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)
limit use with maps and provide narrow caching permissions. The place ID
exception in the [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
addresses caching. It does not itself authorize durable XP, geography counts,
badges, or deduplication identities derived from Geocoding. Obtain a documented
determination covering the actual license and these exact outputs before wiring an
adapter. Seek custom licensing from Google Maps Platform Sales if required.

## Conditional follow-up for Google

- Gate Google calls with a server-only switch defaulting off, a future UTC
  server creation-time cutoff, and an initial allowlist of operator test
  accounts. Disable the switch to stop calls and awards. Never backfill.
- Send only pin coordinates via a bounded server-side request. Use dedicated
  restricted credentials, avoid logging coordinates, API responses and keys,
  and update disclosures and attribution before sending traffic. Review
  existing browser map and label storage separately under the governing terms.
- Approve the [Geocoding SKU and quota settings](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).
  Verify available quota controls in the actual project. Use a transactional
  application-side request cap that counts attempts, including failures and
  retries, plus billing alerts. A billing alert does not cap spend.
- Reject missing or conflicting results, water or coarse-only responses, and
  uncorroborated locality data. An unresolved or conflicting country precludes
  both awards. Conflicting city results should yield no bonus. A confident
  country result with no city can be considered independently only when there
  is affirmative address-level evidence and no ambiguity. Test representative
  inland, open-water, coastal and disputed-border coordinates. Keep the switch
  off if this does not meet the agreed accuracy requirement.
- Keep provider output in memory and review every Firestore write against the
  approval, including identifiers, event payloads, receipts, counts and
  achievements. Keep client labels and geohashes outside award decisions.
  Preserve atomic ledger writes, concurrency protection, and legacy deduplication.
  With separate production approval, run the restricted smoke test before
  widening the allowlist. Monitor request rates, failures, award rates and
  spend without recording precise coordinates or lookup content.

## Pin image authorization and recovery

The authenticated `pinImageUpload` callable creates an intent in the named
Firestore database. The server-generated incarnation and slot IDs expire after
10 minutes and require the same authenticated UID and an active profile.
Authorization counts every requested slot, including abandoned or failed
attempts. The fixed UTC hourly budgets are 100 slots per UID and 200 for the
project across this endpoint, with up to 20 slots per pin and 10 MiB per image.
This permits at most 2,000 MiB of authorized image bytes per hour. Allow for a
burst across the hour boundary. The callable has 8 maximum instances, concurrency
2 and a 60-second timeout. It proxies bytes as base64 to preserve the existing
file size and MIME envelope without issuing direct Storage write credentials.

A Firestore transaction reserves each slot once before touching Storage.
The server checks decoded size and file signature against the declared MIME
type, writes with `ifGenerationMatch: 0` to its reserved object path,
verifies the stored size, MIME, generation and server metadata, and writes
the receipt. Validation checks format signatures. It does not decode images,
scan their contents, or validate dimensions. The server never fetches a
client-provided URL or accepts a client-provided object path or generation.
The draft reuses its pin ID and upload incarnation across retries. Begin
replays reuse the original quota reservation. The slot receipt binds the
validated content digest, nonce and token. A replay can complete a reserved
slot by creating the original object or checking the original generation
after a lost Storage acknowledgement. Finish reuses the original approval
within the authorization window. If the window expires, re-upload under a
new incarnation with the same pin ID.

A new-client Firestore transaction creates the pin, its owner-only publish
receipt and the image claim when present. The receipt survives ordinary pin
deletion. On an uncertain commit, retry the same draft and read its receipt
from the server. The UI suppresses simultaneous submissions and preserves
the draft's attempt during map selection. After discarding the draft or
reloading the tab, check the profile for the published pin before creating
it again. A different draft starts a different operation.

Firestore Rules match the complete URL list and immutable claim against the
server approval and require the pin and claim to be created in the same commit.
The claim binds the owner, ID and incarnation, is consumed once, and persists
for cleanup. Rules forbid later URL changes or copying a managed URL to
another pin's image list. Public image views use the stored Firebase download
URLs. Keep their bearer tokens out of logs. New objects deny client Storage
SDK access and use tokenized reads. Legacy object-level reads remain available under `pins/` and
`pin-images/`. Existing stored URLs are used unchanged. Bucket listing stays
denied, and final Storage Rules prohibit client writes in all three prefixes.
Profile picture Storage access is separate.

A delete event verifies the shared pin/claim create time. The scheduler
pages claims every five minutes for lost delete events and processes due
orphan intents separately. An abandoned intent enters reconciliation an hour
after creation, well after upload authorization closes. Zero writes require
no deletion. If an upload succeeded before its receipt was completed, the
original server reservation nonce and pristine matching Storage metadata can
establish identity. Otherwise preserve the object when identity is ambiguous.
Delete checks the generation and current metageneration and guards both with
preconditions. Replacement objects and precondition failures stay in Storage.
Partial failures resume against the same claim or intent with at most eight
durable attempts. Published claims are scanned in pages of 20, so recovery for
missed delete events can lag as the collection grows.

Keep legacy URL-only pins, objects from the prior client-managed protocol, and
unknown references. This includes account deletion, which leaves legacy pin
images for separate reference and retention review. The delete trigger and
scheduler manage server-owned generations only. Account deletion still removes
profile images and the pin documents. Never use age-based or prefix-wide deletion
for pin images. A job can be complete while containing unresolved objects.
For manual triage record the job, pin, incarnation, slot and reason without
tokens. Delete manually only with separate approval, proven original generation,
proven lack of active references and generation/metageneration preconditions.

The budgets cap admitted Storage bytes, not rejected callable traffic, public
download traffic, cumulative stored bytes, or per-account fairness. Multiple
accounts can exhaust the shared quota. Monitor request volumes, quota rejects,
instance load, old jobs, unresolved entries even on completed jobs, retained
bytes and network spend. Watch these separately from Firestore ledger alerts.
No App Check registration or enforcement is assumed by this release.

### Pin image release sequence

Rehearse using the actual currently published AI Studio build and the pinned
replacement in a disposable environment. Confirm that old-client image URLs
match the tested legacy URL format and that old clients support the expected
image count. Confirm the endpoint origin, callable authentication, runtime
service account and bucket permissions, tokenized public reads, and named
Firestore rules. Record checksums of transitional and final Rules and the
frontend archive. The published Cloud Run bundle `index-DygWuBIz.js` uses
`pins/{uid}/{timestamp}_{sanitizedFilename}` and publishes via a direct
Firestore create. The transitional guard also accepts the later UUID filename
format. Its 20-image limit is enforced when the pin is created, after an old
client may already have uploaded the files. Include stale tabs and failed
legacy batches in the rehearsal. Generate the transitional Rules locally in a release
worktree, without overwriting the canonical Rules:

```sh
node scripts/pin-image-transition-rules.mjs firestore > firestore.pin-transition.rules
node scripts/pin-image-transition-rules.mjs storage > storage.pin-transition.rules
```

1. Before applying transitional Storage Rules, provision the avatar callable
   and finalize trigger under the account deletion gates below and coordinate
   the frontend cutover. The transition closes direct avatar writes, so old
   tabs lose avatar upload until refreshed. Keep deletion intake paused.
   With explicit approval, deploy the transitional named Firestore Rules and
   transitional Storage Rules using a release-only Firebase config pointing to
   those generated files. Firestore accepts old URLs only in the same owner's
   exact legacy bucket and prefix, and the new flow only via server approval.
   Transitional Storage gives old clients create-only access in their legacy
   prefix and no client writes to either managed prefix.
   With separate index approval, apply the `pinImageUploadIntents` index in
   `firestore.indexes.json` to the named Enterprise database and confirm it is
   `READY` before activating the scheduler and callable. The index uses
   `COLLECTION` query scope, `ANY_API` for Native mode, and `DENSE` density, with
   `cleanupAfter ASCENDING` followed by `__name__ ASCENDING`. The index stores an
   unset value for intents without `cleanupAfter`. The cleanup query's range
   filter and `orderBy('cleanupAfter')` exclude those intents from its results.
2. Deploy the approved pin and progression Functions from the pinned
   artifact using the [identity release plan](IDENTITY_RELEASE.md) and
   individually reviewed selectors after the live retry gates are met.
   Apply the three deferred service-level `roles/run.invoker` grants from
   the identity plan once their destination Cloud Run services exist.
   Verify each receiver or OIDC principal on its exact service before
   relying on Eventarc delivery or resuming Scheduler jobs.
   Confirm the pin delete and image reconciliation revisions, drain old
   revisions that could delete legacy images, and activate the upload callable
   after transitional Rules are active. Provision the account-deletion
   worker with legacy adoption disabled once its dependencies are verified.
   Keep deletion intake paused until the compatible frontend and Storage
   protections are effective.
3. Publish the pinned AI Studio frontend. Confirm the deletion UI handles
   both the previous synchronous response and the new queued response before
   switching the deletion callable. Follow [account deletion rollout and
   recovery](#account-deletion-rollout-and-recovery). During the overlap, current clients
   can still publish through the legacy path. Verified new clients can publish
   image and imageless pins, and read legacy pins. Confirm the real published
   assets and client adoption. With separate test-write approval, publish/read/
   delete both kinds of new pin and check cleanup and ordinary XP.
4. Drain in-flight legacy image publishes and communicate the reload deadline
   for stale tabs. Apply final named Firestore Rules first, then final Storage
   Rules immediately afterward. This order closes legacy pin references
   before closing direct uploads. New clients retain photo publishing
   throughout. Old tabs after the deadline need a refresh to attach images.
   Verify both final rulesets and the deployed frontend/Functions SHA and
   revisions before declaring cutover complete.
5. On failure before final enforcement, pause in the restricted transitional
   state. After final enforcement, recover forward with a compatible frontend,
   callable and ruleset that continue enforcing managed claims. Do not restore
   arbitrary image references, direct managed writes, or legacy code that
   automatically deletes ambiguous objects. Review any temporary reopening
   of the legacy create-only path separately.

Firestore child cleanup checks parent absence and child versions together.
Legacy children updated after the deleted parent remain ambiguous and are
retained. A complete cascade for those children needs incarnation data.

### First-release gates

The historical Storage baseline was Rules v2 deny-all, us-west1, UBLA
enabled, PAP not enforced and seven-day soft delete. Refresh that snapshot
and inherited policy. Applying transitional Storage Rules is an access
expansion. Explicitly approve public legacy/avatar reads, owner avatar deletes
and transitional legacy pin creates before opening the window. Avatar create and update remain server-only in both rulesets. Wait for the named database indexes to be ready,
then verify transitional Firestore Rules before opening transitional Storage.
If final Firestore succeeds and final Storage fails, pause, track potential
orphan uploads and close the legacy create window after diagnosing the failure.

Use distinct runtime service accounts. Validate these candidate permissions
against the actual SDKs and effective policies before binding them.

| Runtime | Storage | Named Firestore | Other |
| --- | --- | --- | --- |
| pinImageUpload | objects.create/get under pin-images-v2/ | entities get/list/create/update | |
| reconcilePinImageCleanup | objects.get/delete under pin-images-v2/ | entities get/list/create/update | |
| onPinDeleted | objects.get/delete under pin-images-v2/ | entities get/list/create/update/delete | |
| deleteUserAccount | none | entities get/create/update on deletion state | authenticated callable |
| reconcileAccountDeletion | objects.list at the bucket and objects.delete under profile-images/ | entities get/list/create/update/delete, including the legacy scanner checkpoint | firebaseauth.users.delete |
| uploadProfileAvatar | objects.create/delete under profile-images/ | entities get on profile and deletion lock | authenticated callable |
| onAccountAvatarFinalized | generation-scoped objects.delete under profile-images/ | entities get on deletion lock | Storage Eventarc delivery in the bucket location |
| onUserProfileUpdated | objects.get and generation-scoped objects.delete under profile-images/ | entities get on the profile | Firestore Eventarc delivery |

Use exact bucket and prefix IAM conditions with the trailing slash. The
account deletion path lists at bucket scope even though the SDK requests
a UID prefix. Review bucket-wide name enumeration before approval. Check
database and transaction permissions in addition to entity operations.
Confirm the resolved Admin bucket, named DB override and Eventarc database
filter. Read active revision identities, Scheduler OIDC and Eventarc
invokers, project/ancestor and bucket policies, deny policies and role
definitions. Verify effective access for these principals and denials on
alternate prefixes and the default database. Separate build, deployment
and invocation identities from runtime data permissions.

Verify and preserve live retry policy for `onPinDeleted`. The image scheduler
recovers missed image cleanup. Review child, counter and progression failures
separately. Use the next scheduled tick for failed reconciliation invocations
and track queue lag and unresolved jobs.

### Account deletion rollout and recovery

1. Block account deletion rollout while either cleanup handler is unresolved.
   For Gen1 `onAuthUserDeleted`, capture the Functions v1 API source and
   trigger, region, runtime identity, failure policy and Auth delete side
   effects. The worker uses a single-UID Auth delete, which can invoke
   this trigger. Verify that retries and replays preserve the tombstone,
   surviving users, and legacy pin images, and never recreate the profile
   or avatar. A user-not-found response confirms Auth absence without
   proving Gen1 delivery or cleanup. For Gen2 `onUserProfileUpdated`,
   the audit recorded `onuserprofileupdated-00001-kiz` at 100% in
   `europe-west2` and Eventarc trigger
   `projects/rainbyte-studio/locations/us-west1/triggers/onuserprofileupdated-184598`.
   The trigger is `google.cloud.firestore.document.v1.updated` on
   `users/{userId}` in namespace `(default)` of
   `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
   Reconfirm the manifest's source generation, runtime and delivery
   identities, filters, no-retry policy and effective permissions. Use the
   [identity release plan](IDENTITY_RELEASE.md) for the in-place update.
   Capture the new revision and verify its source and traffic, then drain
   in-flight executions from the old revision before opening avatar upload or
   deletion intake. Recover by redeploying verified generation-safe source.
   The old revision's path-only deletion makes it ineligible for rollback.
2. Reconfirm the Cloud Scheduler API state (last reported `ENABLED`).
   Obtain separate production approval for any IAM and service-agent or OIDC changes, and job
   creation or updates for `reconcilePinImageCleanup` and
   `reconcileAccountDeletion`. Verify effective IAM and job delivery before
   relying on either job. Deploy the named Firestore rules and the retry-enabled
   `onAccountAvatarFinalized` for the exact configured bucket. Confirm
   bucket location, delivery identity, effective generation-scoped delete
   permission, monitoring and Eventarc retry policy. Leave legacy adoption
   off while the old synchronous callable can still run. Deploy
   `uploadProfileAvatar` after the profile cleanup upgrade and finalize
   trigger are verified.
3. Publish the deletion-aware UI and the callable-based avatar frontend.
   Cut over Storage Rules to deny every direct avatar create and update,
   including in the transitional rules. Record when those rules took
   effect and confirm that no other ingress can write the avatar prefix
   after a tombstone, including signed/resumable sessions issued by other
   services, Admin writers, alternate buckets and public IAM. A stale tab
   must refresh to upload avatars or interpret the pending response.
   Verify Storage session lifetime and finalization behavior for this
   bucket before enabling deletion. Keep the deletion intake paused until
   the Storage rules and trigger are effective.
4. Switch the callable to enqueue, preserving the observed live timeout.
   Drain every previous synchronous invocation before enabling legacy
   adoption with `ACCOUNT_DELETION_LEGACY_ADOPTION=true` on the scheduler
   only. Verify that no old revision can still accept requests.
   Reconfirm Functions API retry settings against the manifest before release.

An avatar uploaded by the callable carries the upload response's generation
in its URL fragment. The fragment is consumed by cleanup and excluded from
the HTTP image request. Actual Firebase token URL delivery remains a release
gate. Replacement cleanup checks both profile URL fields, preserves paths
still referenced by the profile, and validates the expected generation,
owner and token metadata. The storage delete is conditioned on both
generation and metageneration. Missing objects are safe on redelivery.
Watch for `avatar_cleanup_unresolved` and track legacy URLs without a
generation and precondition conflicts as preserved objects. Keep the
account deletion worker's UID-prefix sweep and the finalize trigger's
tombstone check as the coverage for deletion-related uploads.

The worker takes a 180-second lease against a 120-second runtime limit. It
commits cursor and phase after successful side effects. It drains avatars
once before removing profile and Auth, then parks at `verifyAvatars`
until eight days after the lock was created or adopted. The allowance
covers a documented week-long Cloud Storage resumable session and a day
of margin. After the deadline, it deletes live and noncurrent avatar
generations and requires an empty strongly consistent prefix listing
before writing `deleted`. Confirm the actual Firebase upload transport,
session expiry, retention, holds, caches and soft-delete policy as live
gates. A late finalize event independently deletes only its own generation
when the tombstone exists, including after completion. Previously issued
bearer URLs can remain usable until a late generation is removed, and
already cached or downloaded copies are outside the worker's control. Soft
delete retention and managed pin cleanup have independent lifecycles.
See [Cloud Storage resumable sessions](https://docs.cloud.google.com/storage/docs/resumable-uploads).

For pending or unknown results, inspect the UID lock in the named database.
A missing lock is distinct from a pending lock or a completed lock. Use
phase, cursor, progressedAt, readyAt, leaseOwner, avatarDrainUntil and
completedAt to distinguish backlog, scheduled drain, active work and
completion. Alert on overdue work, unchanged progress outside the drain
window, repeated errors and stale scan checkpoints. After a crash, let the
lease expire and let the scheduler replay the same phase. Confirm the Auth
state independently. Never recreate the UID or remove the tombstone.

With adoption enabled, the scheduler scans `deleting` locks in
document-ID order. It transactionally adopts legacy locks that lack both
phase and readyAt and have no lease owner, preserving startedAt. Restarting
from likes recovers partially applied cleanup, including when Auth is
already gone. For malformed or mixed-schema locks that the scanner skips,
an authorized operator must inspect the original deletion audit, verify
the UID and database, and confirm that all prior writers and leases are
inactive. For a confirmed pending request, transactionally restore phase
to likes, clear cursor and leaseOwner, set readyAt to now, and set
avatarDrainUntil to now plus eight days. Compare the lock snapshot before
writing. Leave any unproven or terminal lock intact and escalate. Audit
older terminal locks separately for already-existing avatar generations.

For rollback, pause intake and retain compatible named rules, the deny
on direct avatar writes, the finalize trigger, and the current worker
through the last drain window and terminal job. Do not route pending UIDs
to a synchronous delete handler or roll back to a frontend that requires
direct avatar writes. Keep the image handshake frontend in place before
changing pinImageUpload. It uses the incarnation returned by begin for
upload, finish and the Firestore claim. Roll back between upload windows
or pause image publishing while in-flight sessions drain. Mixed versions
can leave unfinished receipts or unused authorizations. Restart failed
image attempts with a fresh incarnation and let existing orphan cleanup
expire abandoned slots. Preserve existing approvals and published claims.
Keep ledger freeze and generation-scoped pin cleanup active.

Production managed-image delivery verification remains open. Keep it separate
from emulator CI. Rehearse actual browser rendering of pin feed, previews,
details, profile pins, geographic clusters and avatars in a separately
approved disposable environment. Include stale tabs, legacy assets, owner
and non-owner avatar permissions, managed SDK denial and image cleanup.
Public Firestore pin reads expose stored image URLs. Confirm the product
accepts bearer access independently of UI visibility. UBLA disables object
ACLs, and PAP status alone does not establish Firebase delivery behavior.
