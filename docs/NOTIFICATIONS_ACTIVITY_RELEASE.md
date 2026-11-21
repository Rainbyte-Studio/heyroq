# Notifications & Activity v1.0

## Data and access

| Path under users/{uid} | Purpose | Client access |
| --- | --- | --- |
| notifications/{sha256} | Private inbox records and short-lived deduplication tombstones | Authenticated owner via callable |
| notificationState/inbox | Sequence, unread count, read-through watermark and revision | Owner snapshot listener |
| notificationPreferences/settings | Optional delivery and activity sharing preferences | Owner get and validated merge write |
| activityV1/{sha256} | Private activity projection and potential Following candidates | Authenticated callable with source and visibility checks |
| notificationCommands/{operationId} | Trusted, targeted announcement or account notice intake | Admin SDK only |

The callable derives the viewer from Firebase Auth. It validates activity against current profiles, account deletion locks, follows, sharing preferences, pin visibility and the committed progression source. It returns sanitized presentation fields. Geographic titles use the verified catalog receipt. All in-app destinations are typed IDs for existing views. Keep public sharing off for existing accounts until they opt in. Optional in-app notification preferences default to enabled.

New published pins require the matching publication receipt. A like, comment, reply or follow must still exist when its create event is processed. Like groups are displayed as a disclosure with independent read and delete controls. A reply targets the top-level comment author. Give each system operation a unique ID and use a trusted Admin SDK write with only type and title. Supported types are announcement for optional product updates and account for important account notices. The command is removed transactionally on processing. A bulk broadcast or self-serve announcement console would require a separately reviewed delivery workflow.

Progression consumers use only the server ledger and summary in progressionV11. The cutoff is checked on projection and presentation. Rewards and thresholds are owned by the existing progression writers. A new city and country on the same pin produce one geography notification while retaining both milestones in My Activity. Following can show Gold and Platinum achievements when the actor opts in. Historic events are outside the initial projection. The active writer control still governs geography eligibility.

## Queries and limits

- Inbox uses a collection index on deleted and descending sequence. The transaction updates a single owner counter. Mark-all records a read-through watermark and resets the unread count in constant time.
- Following considers the 90 most recent follows and queries activity only from authors who opted in. It uses a collection-group index on actorId, eligible and descending key, merges up to three bounded candidate windows and returns up to 24 rows. The cursor is based on a visible row. If filtering leaves a sparse result at the scan limit, deeper items may be absent. The timeline never fans out on publish.
- The cleanup worker checks expiresAt collection-group indexes every 15 minutes, up to 150 inbox and 150 activity documents per run. It removes inbox rows in transactions to maintain the count. This yields roughly 90 days of history. Monitor cleanup lag and inbox-control document contention as traffic grows.
- Server retries use deterministic IDs and verify event incarnations. Tombstones prevent a deleted or muted notification from reappearing during replay. Account deletion recursively clears the owner's projections and locks invalidate cross-user references immediately when the server builds a feed page. The open Following UI refreshes on window focus and every 30 seconds.
- Scaling options include follow-cursor partitions, bounded fan-out for low-fanout profiles and pull reads for high-fanout profiles. Any caching layer must preserve revocation checks.

## Audit and Firestore cost

The estimates below count document lookups requested and document writes for the engagement component on a successful first attempt. They exclude the existing social/progression writers, transaction retries, index scans, billed read units determined by bytes, and client public-profile reads. Emulator tests verify observable behavior. They do not measure production billing.

| Operation | Estimated document reads | Estimated document writes |
| --- | ---: | ---: |
| Like on another user's public pin | 9 | 2 |
| Comment on another user's public pin | 9 | 2 |
| Reply to another user's top-level comment | 10 | 2 |
| New follow with a matching reciprocal record | 9 | 2 |
| Achievement unlock | 9 | 3 |
| Level-up | 8 | 3 |
| Geographic city or country reward | 9 per ledger event | 3 for the first reward on a pin, 1 for a second reward on that pin |
| Open Notifications Center or load its next page | 4 baseline plus up to 24 inbox rows and up to 7 distinct lookups per row | 0 |
| My Activity page | 3 baseline plus up to 72 candidates and at most 3 related document lookups per candidate | 0 |
| Following Activity page | 3 baseline, up to 91 relationships, 90 preference lookups, 90 reciprocal checks, up to 216 query results and at most 5 distinct source lookups per presented candidate | 0 |
| Mark all as read | 3 | 1 when there are unread items |
| Mark or delete one notice | 4 | Up to 2 |

Each feed request shares one current Firestore snapshot and reuses lookups for repeated actors, pins and sources. The figures for subsequent pages follow the same formulas. A 30-second visible Following refresh limits the age of rows displayed in an open panel. Returning to a hidden tab fetches again. Previously delivered content can persist in a browser until it is refreshed, and content already observed cannot be recalled.

Read operations verify both sides of a follow and the owner's current sharing settings. Comment notices retain only document references and timestamps, and lose their actor/title/destination when the comment or reply parent is removed. Re-created likes and follows from the same actor are limited to one notice per UTC day for a target. Unread count changes stay in the inbox transaction and apply to each notification independently of display grouping. The inbox uses delivery sequence for pagination and the source timestamp for display.

## Compatibility and recovery

The frontend expects the callable and named database Rules to be live. Roll the frontend back before retiring the endpoint. Leave the projections and indexes in place during rollback. The Social/Progression producers continue operating independently if the engagement event consumers are paused. Releasing the consumers later starts new history. Old Firestore events are not backfilled automatically.

Confirm the indexes and runtime settings against the production Enterprise database during the authorized release. The emulator exercises Rules and application queries but does not certify Enterprise index build state, billing, Eventarc delivery or runtime IAM. The checked-in deployment manifest lists the intended trigger paths and bindings.

### Pin access and migration

The Firestore boundary uses an explicit publicAccess marker. Only public, published pins without private, deletion, report or demo flags may receive the marker. Reads of individual documents also verify the pin state. All public pin queries require the marker. Owners can list by their authenticated UID and open their own private, draft and unclassified pins. Pin comments and likes inherit the parent read restriction. New interactions require a public published pin.

The map uses bounded public geohash listeners. Recent, popular, category, search catalog and public profile and footprint queries use the same public marker, visibility and publication constraints. Search watches up to 180 matches and withdraws results when their public access changes. Owner profile queries use a separate UID-constrained read. Pin detail reads use the server. The SDK keeps new pin documents in memory, and pin listeners require server-confirmed snapshots for each session. Older IndexedDB data and previously copied payloads cannot be recalled. Notifications and activity revalidate the underlying Firestore document, publication state and incarnation. Geography rejects explicit restricted states without changing reward values or thresholds. Administrative moderation, progression writers, account deletion and image cleanup use trusted service access. Private coordinates remain in the owner document and are excluded from discovery and engagement responses.

Run the checked-in migration first in dry-run mode. It scans in bounded pages and only backfills a pin if the original server publication receipt matches the pin's creation commit and the record has no explicit restriction. Unverified historical records stay hidden from public queries and remain visible to their owner. Review those records individually before restoring any visibility. The migration updates only visibility, status and publicAccess, leaves existing classifications alone, and can be retried. Re-run dry-run after the cutover write window to account for older clients that might still publish.

### Pin images

New managed uploads write tokenless, backend-only pin-images-v2 objects. The upload approval points at publicPinImageV1. It serves one bounded image only when the named database reports a current public published pin and a matching same-commit claim, exact object generation, and owner metadata. Before publication, after restriction, and after deletion the public endpoint returns no image. pinImageAccessV1 returns one image to the signed-in owner of a restricted pin. The frontend uses revocable in-memory blob URLs in the private gallery. Both endpoints validate MIME signatures and use no-store responses. Images already received by a client cannot be recalled.

Existing public legacy URLs remain compatible. Only server-approved checked images may be attached to new restricted pins. Existing image-bearing pins with bearer URLs cannot be restricted through a client-only state update. Reviewed legacy objects can be marked server-side as restricted and have tokens removed under generation and metageneration preconditions. The Storage Rules then deny direct reads of tagged legacy objects. The owner callable recognizes those objects only when ownership and pin metadata match and tokens are absent. Replacement, deletion, or republication of legacy media requires separate review so an old URL never becomes valid again.

The production read-only check on 2026-11-21 returned zero pin documents and zero live objects under pins/, pin-images/ and pin-images-v2/. It found three image claims, one upload approval and one upload intent. No token was revoked and no objects or Firestore documents were changed. Repeat the inventory during the release write freeze. The currently deployed upload revision can issue legacy tokens until the new revision takes over and its old upload approvals expire.

Use scripts/remediate-pin-image-tokens.mjs for a redacted dry run. Each reviewed apply accepts one digest plus verified owner-client readiness, requires active owner delivery and the exact Storage Rules, and checks current references and object versions before patching metadata. Keep pin writes frozen across the operation and verify public access to positive controls and owner access before reopening. Ambiguous and unreferenced objects require separate disposition. Cache invalidation prevents new fetches after revocation. Copies already downloaded or held by intermediaries may survive.

The Storage emulator automatically issues a replacement token when its test-only API removes the final token. The emulator tests old-token denial and owner delivery on a separate tokenless fixture. Rehearse the exact production metadata operation on disposable media during a separately authorized release if remediation becomes necessary.

## Release sequence

1. Use an explicitly authorized release with a reviewed immutable commit and the named Firestore database. Record the serving frontend digest, Cloud Functions revisions, deployed Firestore and Storage Rules, index state, Scheduler identity and the current progression writer configuration. Prepare a rollback frontend that uses the strict publicAccess query contract.
2. Build the visibility and engagement indexes and wait for them to be ready. In the scheduled pin-write freeze, repeat the read-only pin/media inventory and dry-run the visibility backfill. Review and apply only approved backfill entries. Keep the write freeze in place through the frontend cutover.
3. Release publicPinImageV1 and pinImageAccessV1 in europe-west2, then release the checked pinImageUpload revision. Allow outstanding legacy upload approvals to expire. Apply reviewed Storage Rules and complete any separately approved token remediation after confirming owner delivery is ready.
4. Apply the reviewed Firestore Rules to the named database. Keep the interval before the matching frontend cutover short because older public queries lack the new visibility constraints. Release the [engagement endpoints and triggers](engagement-deployment-manifest.json), and bind the private cleanup worker to its Scheduler OIDC invoker. Keep existing progression writers and service identities intact. Confirm callable routing, named-database trigger bindings, indexes and Rules before sending public traffic to the new build.
5. Smoke-test the candidate using approved test accounts and dedicated fixtures. An unauthenticated callable POST should yield the Firebase JSON UNAUTHENTICATED response. Verify the authenticated inbox, My Activity and Following responses, owner-only preference writes and unread listener, sharing opt-out and revoked follow behavior, and a single progressionV11 award and projection. Verify checked pin upload, public-to-restricted image access and owner delivery before reopening writes. Publish the matching frontend and confirm the serving commit in About Heyroq diagnostics plus the desktop/mobile navigation and keyboard flows.
6. If rollback is needed, restore a frontend that already uses the publicAccess query contract. Keep strict Rules, checked image endpoints, tokenless upload and media revocations in place. Temporarily freeze publication if that combination is unavailable. Pause engagement projections and scheduler separately if necessary after checking in-flight delivery.

Production release and any push or email delivery are separate work.

## Production observation on 2026-11-21

- GitHub main was at the PR #46 merge, `2378d5d04bf30e4b4c36d92a5364e299ebba5205`. The public production URL served `index-DWBImVHb.js` at both 1280px and 390px. That bundle contained progressionV11 and lacked engagementV1 and Notifications & Activity. These browser sessions were signed out.
- A read-only callable POST with the production Origin and no credentials returned Google's generic HTML 404 from `https://europe-west2-rainbyte-studio.cloudfunctions.net/engagementV1`. The image-access callable also returned the generic 404. In the same project and region, `recalculateProgression` returned HTTP 401, Firebase JSON UNAUTHENTICATED and the expected CORS header. This verifies public engagement routing was unavailable at the time of the check. A browser running an engagement-enabled build against that route can surface a generic Functions error. The build shown in the reported screenshots could not be identified.
- This probe cannot verify deployed Rules, index readiness, authenticated client behavior or backend logs. In the release window, distinguish a route 404 from a callable JSON UNAUTHENTICATED response, a browser permission-denied on the named Firestore listener, or a server FAILED_PRECONDITION in the callable logs. Check the deployed resources in the project before approving the frontend cutover.

### Follow-up inventory

The serving Cloud Run service in `us-west1` routed 100% of traffic to
`heyroq-nearby-646d0c3`. Its `index-DWBImVHb.js` bundle reported the
`646d0c3` build and contained progressionV11, with no engagement callable
reference. GitHub main was `6490765` and included PRs #46 and #47.
The engagement-enabled build in the report remains unidentified.

| Production check | Result | Required cutover |
| --- | --- | --- |
| Callable route and Functions inventory | `engagementV1` and `pinImageAccessV1` returned HTTP 404 HTML. `recalculateProgression` in the same region returned HTTP 401 Firebase JSON. All eleven exports in the engagement deployment manifest were absent from the inventory. | Stage the three browser-facing endpoints, seven named-database handlers, and private cleanup worker using the reviewed Gen 2 release path. |
| Firestore Rules release | Named database used ruleset `93f94075-517c-488f-8ab1-a5989e978957`, which lacks owner access for `notificationPreferences/settings` and `notificationState/inbox`, and the public pin access contract. | Release the repository Rules to the named database with the matching frontend and pin write freeze described above. |
| Firestore indexes | The Enterprise Native database is in `us-west1`. The inventory had no indexes for `notifications` or `activityV1`. | Build all five engagement indexes in `firestore.indexes.json` and the missing public visibility indexes. Confirm READY before testing the release candidate. |
| Storage Rules release | Bucket `rainbyte-studio.firebasestorage.app` used ruleset `047f6b15-c2af-4756-8ce4-058b21376c51`. It references managed images and differs from the reviewed Rules. | Diff the complete deployed Rules, verify the checked upload revision and both image delivery endpoints, then follow the image cutover above. |
| Cleanup schedule | The `europe-west2` inventory contained only the existing pin-image and account jobs. The `us-west1` inventory was empty. | Configure one UTC job in `europe-west2` for the private worker, every 15 minutes. Verify POST and OIDC audience against its canonical Run URI, service-scoped Invoker and one successful cleanup run. Preserve the existing jobs. |

The route gap prevents inbox, history, both Activity feeds and mark-as-read from
reaching the server. The Rules gap independently blocks preference reads and writes
and the unread listener. A first-time user legitimately has no preferences or
counter document. The checked-in Rules allow an owner to read those paths, and
the client derives defaults from the missing snapshots. Indexes are a separate
requirement once the callable is routed and authenticated.

For Eventarc, verify the trigger location is `us-west1` for the named database
and check the database and document path filters on all seven deployed triggers.
The Functions serving region in the manifest is `europe-west2`. Preserve the
existing progression writers and verify one new eligible event through delivery.
Use the existing Functions deploy guard and the reviewed, explicit Gen 2 release
path. First test an approved candidate and disposable accounts, including a first
preference save and a reopened Settings window. If any component fails these
checks, keep the frontend cutover on hold.
