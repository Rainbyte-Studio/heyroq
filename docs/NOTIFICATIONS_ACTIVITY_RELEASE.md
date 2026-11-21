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

### Merge gate for private and unpublished pins

The engagement callable filters restricted pins and omits their details. The existing Firestore Rules still allow any client to get or list raw pin documents. An emulator fixture marked private and draft proves that the raw document, including coordinates, remains readable without authentication. Existing map, search, profile and discovery queries read that collection broadly, and legacy pins can lack visibility fields. Changing the Rules alone would break those queries. Resolve the raw pin access contract with compatible queries and a rollout for existing pins before certifying this privacy requirement.

## Release sequence

1. Use an explicitly authorized release with a reviewed immutable commit and the named Firestore database. Review the index build and security rule diff. Keep the existing progression config and identities intact.
2. Deploy the five engagement indexes and wait for readiness. Apply the reviewed Firestore rules to the named database. Verify that existing pin, Storage and progression access still passes.
3. Release only the endpoints in the [engagement manifest](engagement-deployment-manifest.json) using the repository's isolated Functions release procedure. Bind the retention scheduler to the private POST worker using a dedicated OIDC invoker. Verify trigger bindings and retries with disposable accounts. Compare the progression control and ledger before and after.
4. Publish the matching frontend only after the backend checks pass. Verify live inbox counts, Following privacy, keyboard flows and both viewport layouts. Keep the previous frontend revision available for rollback.
5. If rollback is needed, restore the previous frontend and pause only the engagement projections and scheduler after checking in-flight delivery. Keep engagement data available for investigation. Rehearse before dropping new rules or indexes.

Production release and any push or email delivery are separate work.
