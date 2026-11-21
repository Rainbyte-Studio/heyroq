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
- Following uses a collection-group index on actorId, eligible and descending key. It reads the 90 most recent follows in up to three batches, merges candidate pages, and validates up to 24 rows per request. A sparse page may still have a cursor. The timeline never fans out on publish.
- The cleanup worker checks expiresAt collection-group indexes every 15 minutes, up to 150 inbox and 150 activity documents per run. It removes inbox rows in transactions to maintain the count. This yields roughly 90 days of history. Monitor cleanup lag and inbox-control document contention as traffic grows.
- Server retries use deterministic IDs and verify event incarnations. Tombstones prevent a deleted or muted notification from reappearing during replay. Account deletion recursively clears the owner's projections and locks invalidate cross-user references immediately when the server builds a feed page. The open Following UI refreshes on window focus and every 30 seconds.
- Scaling options include follow-cursor partitions, bounded fan-out for low-fanout profiles and pull reads for high-fanout profiles. Any caching layer must preserve revocation checks.

## Release sequence

1. Use an explicitly authorized release with a reviewed immutable commit and the named Firestore database. Review the index build and security rule diff. Keep the existing progression config and identities intact.
2. Deploy the five engagement indexes and wait for readiness. Apply the reviewed Firestore rules to the named database. Verify that existing pin, Storage and progression access still passes.
3. Release only the new engagement endpoints and scheduler using the repository's isolated Functions release procedure. Review trigger bindings, retries and runtime identities. Verify with disposable accounts and compare the progression control and ledger before and after.
4. Publish the matching frontend only after the backend checks pass. Verify live inbox counts, Following privacy, keyboard flows and both viewport layouts. Keep the previous frontend revision available for rollback.
5. If rollback is needed, restore the previous frontend and pause only the engagement projections and scheduler after checking in-flight delivery. Keep engagement data available for investigation. Rehearse before dropping new rules or indexes.

Production release and any push or email delivery are separate work.
