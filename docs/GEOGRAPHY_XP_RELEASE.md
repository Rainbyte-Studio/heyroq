# Geographic XP rollout and recovery

The Functions runtime has no writer for new `UNIQUE_CITY` or `UNIQUE_COUNTRY`
ledger events and no geography provider or receipt creation path. Historical XP
and ledger documents are preserved by progression. Geography counts retain the
greater of their stored and ledger-derived values. Unlocked geographic badges
remain unlocked, and geography progress is derived from earned records; the
paused runtime cannot unlock new geographic badges or award their XP. Account
deletion still removes the departing account's data.

## Scope and evidence

See [the machine-readable manifest](progression-deployment-manifest.json) for all
11 existing endpoints plus the image upload callable and reconciliation
scheduler, their triggers, intended retries, and the production preflight snapshot. The snapshot is historical. The two unknown Functions API retry
values must be checked before approval.

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
   this snapshot and stop on drift or unresolved identity. Verify the
   Functions API retry values for the two added Eventarc endpoints, along
   with the Functions API configuration for all 11.
2. Explicitly approve the retry change for pin create, both likes, both
   comments, and both followers from observed `RETRY_POLICY_DO_NOT_RETRY` to
   `RETRY_POLICY_RETRY`. Preserve the approved SDK defaults for pin delete and
   profile update (`DO_NOT_RETRY`), subject to verification of their live settings.
   Callables have no event retry policy. Pub/Sub subscription backoff is a
   separate setting. Also review the account deletion timeout change from the
   preflight's 60 seconds to the approved code's 540 seconds.
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
   recalculations. Claim the freeze only after all 11 are verified on safe code,
   traffic no longer routes to old revisions, and any in-flight legacy
   executions have drained. On partial failure, inventory the 11 endpoints,
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
`heyroq-00021-qhf` was Ready at 0% and remains untested as a public restore
target. The approved Git build and two older candidates did not reproduce the
published assets under the tested conditions.

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
- Immediately before an approved frontend change, re-read the live revision,
  traffic, readiness, runtime dependencies and public hashes. If
  `heyroq-00022-nf2` is still active, retain it as the frontend rollback target.
  Under separate approval, set Cloud Run service `heyroq` in `us-west1` to
  100% on that exact revision and verify `status.traffic`, HTTP health and
  the saved HTML/JS hashes on the public and Run URLs. Capture the current
  configuration first. A traffic update restores the published artifact, not
  the AI Studio editor state; verify domain routing after changes.

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
A failure after slot reservation requires a fresh publish attempt. A
successful finalization can be retried within the authorization window.

Firestore Rules match the complete URL list and immutable claim against the
server approval and require the pin and claim to be created in the same commit.
The claim binds the owner, ID and incarnation, is consumed once, and persists
for cleanup. Rules forbid later URL changes or copying a managed URL to
another pin's image list. Public image views use the stored Firebase download
URLs. Keep their bearer tokens out of logs. New objects deny client Storage
SDK access and use tokenized reads. Legacy prefixes stay readable, and the
final Storage Rules prohibit all client mutations in all three pin prefixes.
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
frontend archive. Generate the transitional Rules locally in a release
worktree, without overwriting the canonical Rules:

```sh
node scripts/pin-image-transition-rules.mjs firestore > firestore.pin-transition.rules
node scripts/pin-image-transition-rules.mjs storage > storage.pin-transition.rules
```

1. With explicit approval, deploy the transitional named Firestore Rules and
   transitional Storage Rules using a release-only Firebase config pointing to
   those generated files. Firestore accepts old URLs only in the same owner's
   exact legacy bucket and prefix, and the new flow only via server approval.
   Transitional Storage gives old clients create-only access in their legacy
   prefix and no client writes to either managed prefix.
   With index approval, apply the sparse orphan-queue index in
   `firestore.indexes.json` to the named Enterprise database and confirm it is
   ready before activating the scheduler and callable.
2. Deploy the approved Functions from the pinned artifact using explicit
   selectors. Confirm safety of pin deletion and account deletion and drain
   old revisions that could delete legacy images. Verify the reconciliation
   scheduler and deploy/enable the new upload callable only after the
   transitional Firestore Rules are confirmed active. A wholesale deployment
   of the 11 existing handlers must wait for separate decisions on the
   timeout and retry deltas identified above.
3. Publish the pinned AI Studio frontend. During the overlap, current clients
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

For the account-deletion callable, treat 540 seconds as a candidate ceiling.
The frontend allows 550 seconds, leaving 10 seconds of nominal headroom.
Before approval, measure representative large accounts in staging and
prove that a lost response or server timeout can be resumed safely.
