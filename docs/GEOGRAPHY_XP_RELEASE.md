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
11 endpoints, trigger selectors, intended retries, and the production preflight
snapshot. The snapshot is historical. The two unknown Functions API retry
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
3. After production approval, deploy the 11 named Functions from the same
   immutable package. The Firebase CLI selector is the comma-separated list
   of manifest keys, each prefixed with `functions:`. Use the explicit project
   `rainbyte-studio` and the verified CLI identity. This scope covers Functions
   only. Review any CLI proposal for enabling APIs or changing IAM separately.
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

### Open pin-deletion release blocker

The draft retains Storage objects on spot deletion. Existing image URLs record
a bucket and path and can be reused by a recreated pin. An owner-path check or
a generation fetched during delivery cannot establish that the deleted pin
owned that generation exclusively. Require an authoritative, immutable pin
incarnation binding and the originally attached object generation before
enabling deletion. A generation mismatch or missing object must preserve any
replacement. Recovery must handle partial failures without falling back to
an unconditional delete. Coordinate the hosted frontend because legacy
clients can still delete from their Storage namespace directly.

Firestore cleanup checks parent absence and each child version in the same
transaction. Legacy children updated after the deleted parent's last update
remain ambiguous and are retained. A complete cascade needs incarnation data
for those children. Confirm the two unknown live retry settings before
rollout. Keep automatic retries off for the delete trigger until the complete
cascade can safely resume, and verify error monitoring and manual recovery.
For the account-deletion callable, treat 540 seconds as a candidate ceiling.
The frontend allows 550 seconds, leaving 10 seconds of nominal headroom.
Before approval, measure representative large accounts in staging and
prove that a lost response or server timeout can be resumed safely.
